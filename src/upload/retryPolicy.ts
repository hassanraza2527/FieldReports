import { ApiError, isApiError } from '../api/errors';

export type Verdict =
  | { action: 'retry'; retryAfterMs?: number }
  /** Server forgot something (404) or lacks an image (409): re-create / re-upload, do not give up. */
  | { action: 'resync'; reason: 'report_missing' | 'images_missing' }
  /** 401 that a re-login could not fix: pause the whole queue, never fail the report. */
  | { action: 'auth' }
  | { action: 'permanent'; message: string }
  | { action: 'cancelled' };

export interface RetryConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  minDelayMs: number;
  maxLocalFailures: number;
}

/** Deliberately an allow-list of "keep trying" statuses: everything else 4xx is the request's fault. */
export function classifyError(err: unknown, ctx: { attempts: number; maxLocalFailures: number }): Verdict {
  if (!isApiError(err)) {
    // A non-network crash (file missing, native failure). Retry a few times, then ask the human.
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return ctx.attempts + 1 >= ctx.maxLocalFailures ? { action: 'permanent', message: msg } : { action: 'retry' };
  }
  switch (err.kind) {
    case 'aborted':
      return { action: 'cancelled' };
    case 'auth':
      return { action: 'auth' };
    case 'network':
    case 'timeout':
      return { action: 'retry' };
    case 'http':
      return classifyHttp(err);
  }
}

function classifyHttp(err: ApiError): Verdict {
  const s = err.status ?? 0;
  if (s === 401) return { action: 'auth' };
  if (s === 404) return { action: 'resync', reason: 'report_missing' };
  if (s === 409) return { action: 'resync', reason: 'images_missing' };
  if (s >= 500 || s === 408 || s === 429) return { action: 'retry', retryAfterMs: err.retryAfterMs };
  return { action: 'permanent', message: err.message || `Rejected by server (${s})` }; // 400 / 413 / 422 / 403 ...
}

/** Exponential backoff with full jitter, capped. Server's Retry-After wins when larger. */
export function computeBackoff(attempts: number, random: () => number, cfg: RetryConfig, retryAfterMs?: number): number {
  const ceiling = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** attempts);
  const jittered = Math.max(cfg.minDelayMs, Math.floor(random() * ceiling));
  return Math.max(jittered, retryAfterMs ?? 0);
}
