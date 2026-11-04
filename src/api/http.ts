import { ApiError } from './errors';

export interface HttpConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}
export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  token?: string | null;
  json?: unknown;
  body?: unknown; // raw body (Blob) for image upload
  contentType?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}
export interface HttpResponse<T = any> {
  status: number;
  data: T;
}
export type Http = <T = any>(req: HttpRequest) => Promise<HttpResponse<T>>;

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const s = Number(v);
  return Number.isFinite(s) ? Math.min(s, 600) * 1000 : undefined;
}

/** Turns every failure into an ApiError so the retry policy has ONE thing to classify. */
export function createHttp(cfg: HttpConfig): Http {
  const f = cfg.fetchImpl ?? fetch;
  return async <T,>(req: HttpRequest): Promise<HttpResponse<T>> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, req.timeoutMs);
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);
    if (req.signal?.aborted) controller.abort();

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (req.token) headers.Authorization = `Bearer ${req.token}`;
    let body: any;
    if (req.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.json);
    } else if (req.body !== undefined) {
      headers['Content-Type'] = req.contentType ?? 'application/octet-stream';
      body = req.body;
    }

    try {
      const res = await f(cfg.baseUrl + req.path, { method: req.method, headers, body, signal: controller.signal });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new ApiError('http', data?.error?.message ?? `HTTP ${res.status}`, {
          status: res.status,
          code: data?.error?.code,
          retryAfterMs: parseRetryAfter(res.headers?.get?.('retry-after') ?? null),
        });
      }
      return { status: res.status, data };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (req.signal?.aborted) throw new ApiError('aborted', 'Cancelled');
      if (timedOut) throw new ApiError('timeout', 'Request timed out');
      throw new ApiError('network', 'Network request failed');
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  };
}
