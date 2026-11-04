export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'auth' | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly retryAfterMs?: number;

  constructor(kind: ApiErrorKind, message: string, extra: { status?: number; code?: string; retryAfterMs?: number } = {}) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code;
    this.retryAfterMs = extra.retryAfterMs;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
