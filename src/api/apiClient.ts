import { ServerReport } from '../domain/types';
import { AuthService } from './authService';
import { ApiError, isApiError } from './errors';
import { Http, HttpRequest } from './http';

export interface UploadApi {
  createReport(i: { id: string; description: string; imageIds: string[] }, signal?: AbortSignal): Promise<void>;
  getReportStatus(id: string, signal?: AbortSignal): Promise<{ status: string; receivedImageIds: string[] }>;
  uploadImage(reportId: string, imageId: string, filePath: string, signal?: AbortSignal): Promise<void>;
  commitReport(id: string, signal?: AbortSignal): Promise<void>;
}
export interface ReviewApi {
  listReports(limit?: number): Promise<ServerReport[]>;
  /** Deletes one of the signed-in user's reports on the server. Already gone (404) counts as success. */
  deleteReport(id: string): Promise<void>;
}

export interface ApiClientDeps {
  http: Http;
  auth: AuthService;
  requestTimeoutMs: number;
  uploadTimeoutMs: number;
  /** Reads a local file as a request body. Default works in React Native (fetch on file:// returns a Blob). */
  readFile?: (path: string) => Promise<unknown>;
}

const defaultReadFile = async (path: string) => (await fetch(path.startsWith('file://') ? path : `file://${path}`)).blob();

/** Tolerant mapper: the list payload shape is inferred from the Postman collection. */
export function mapServerReport(r: any): ServerReport {
  const t = Date.parse(r.createdAt ?? r.created_at ?? r.committedAt ?? r.committed_at ?? '');
  return {
    id: String(r.id),
    description: String(r.description ?? ''),
    status: String(r.status ?? 'committed'),
    createdAt: Number.isFinite(t) ? t : 0,
    images: Array.isArray(r.images) ? r.images.map((i: any) => ({ id: String(i.id), url: i.url ?? null })) : [],
  };
}

export function createApiClient(d: ApiClientDeps): UploadApi & ReviewApi {
  const readFile = d.readFile ?? defaultReadFile;

  /** Adds the bearer token; on 401 refreshes once and replays. Still 401 => ApiError('auth'). */
  async function authed<T = any>(req: Omit<HttpRequest, 'token'>) {
    let token = (await d.auth.getToken()) || null;
    // Signed up while offline: create the account first. Still offline => retryable, NOT an auth failure.
    if (!token && (await d.auth.hasPending())) token = await d.auth.syncPending();
    if (!token) {
      throw (await d.auth.hasPending())
        ? new ApiError('network', 'Account not created on the server yet')
        : new ApiError('auth', 'Not signed in', { status: 401 });
    }
    try {
      return await d.http<T>({ ...req, token });
    } catch (e) {
      if (!(isApiError(e) && e.kind === 'http' && e.status === 401)) throw e;
      token = await d.auth.refresh(token);
      try {
        return await d.http<T>({ ...req, token });
      } catch (e2) {
        if (isApiError(e2) && e2.kind === 'http' && e2.status === 401) throw new ApiError('auth', 'Unauthorized', { status: 401 });
        throw e2;
      }
    }
  }

  return {
    async createReport(i, signal) {
      await authed({
        method: 'PUT',
        path: `/api/reports/${i.id}`,
        json: { description: i.description, imageIds: i.imageIds },
        timeoutMs: d.requestTimeoutMs,
        signal,
      });
    },
    async getReportStatus(id, signal) {
      const r = await authed({ method: 'GET', path: `/api/reports/${id}`, timeoutMs: d.requestTimeoutMs, signal });
      return { status: String(r.data.status), receivedImageIds: r.data.receivedImageIds ?? [] };
    },
    async uploadImage(reportId, imageId, filePath, signal) {
      const body = await readFile(filePath);
      await authed({
        method: 'PUT',
        path: `/api/reports/${reportId}/images/${imageId}`,
        body,
        contentType: 'image/jpeg',
        timeoutMs: d.uploadTimeoutMs,
        signal,
      });
    },
    async commitReport(id, signal) {
      await authed({ method: 'POST', path: `/api/reports/${id}/commit`, timeoutMs: d.requestTimeoutMs, signal });
    },
    async listReports(limit = 50) {
      const r = await authed({ method: 'GET', path: `/api/reports?limit=${limit}`, timeoutMs: d.requestTimeoutMs });
      return (r.data.reports ?? []).map(mapServerReport);
    },
    async deleteReport(id) {
      try {
        await authed({ method: 'DELETE', path: `/api/reports/${id}`, timeoutMs: d.requestTimeoutMs });
      } catch (e) {
        if (isApiError(e) && e.kind === 'http' && e.status === 404) return;
        throw e;
      }
    },
  };
}