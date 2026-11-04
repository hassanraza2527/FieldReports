import { ApiError } from '../api/errors';
import { AuthService } from '../api/authService';
import { createApiClient, mapServerReport } from '../api/apiClient';
import { Http } from '../api/http';
import { LocalReport } from '../domain/types';
import { mergeReports } from '../domain/reportList';
import { summarizeSync } from '../domain/syncSummary';
import { validateDraft } from '../domain/validation';
import { compressToLimit, ImageTooLargeError } from '../images/compression';
import { InMemoryReportStore } from '../storage/memory/InMemoryReportStore';
import { classifyError, computeBackoff } from '../upload/retryPolicy';

const cfg = { baseDelayMs: 1000, maxDelayMs: 300_000, minDelayMs: 500, maxLocalFailures: 8 };
const http = (status: number) => new ApiError('http', 'x', { status });
const ctx = { attempts: 0, maxLocalFailures: 8 };

describe('retryPolicy', () => {
  it.each([500, 502, 503, 504, 408, 429])('retries %i', s => expect(classifyError(http(s), ctx).action).toBe('retry'));
  it.each([400, 413, 422, 403])('treats %i as permanent', s => expect(classifyError(http(s), ctx).action).toBe('permanent'));
  it('network + timeout retry; 401 pauses; 404/409 resync', () => {
    expect(classifyError(new ApiError('network', ''), ctx).action).toBe('retry');
    expect(classifyError(new ApiError('timeout', ''), ctx).action).toBe('retry');
    expect(classifyError(http(401), ctx).action).toBe('auth');
    expect(classifyError(http(404), ctx).action).toBe('resync');
    expect(classifyError(http(409), ctx).action).toBe('resync');
  });
  it('unknown local errors give up after maxLocalFailures', () => {
    expect(classifyError(new Error('boom'), { attempts: 0, maxLocalFailures: 3 }).action).toBe('retry');
    expect(classifyError(new Error('boom'), { attempts: 2, maxLocalFailures: 3 }).action).toBe('permanent');
  });
  it('backoff grows, is capped, jittered and honours Retry-After', () => {
    expect(computeBackoff(0, () => 1, cfg)).toBe(1000);
    expect(computeBackoff(3, () => 1, cfg)).toBe(8000);
    expect(computeBackoff(30, () => 1, cfg)).toBe(300_000);
    expect(computeBackoff(3, () => 0, cfg)).toBe(500);
    expect(computeBackoff(1, () => 0.5, cfg, 30_000)).toBe(30_000);
  });
});

describe('compression policy', () => {
  const discard = jest.fn(async () => undefined);
  it('stops at the first rung that meets the target', async () => {
    const resize = jest.fn(async () => ({ path: '/o.jpg', size: 700_000 }));
    const r = await compressToLimit(resize, '/18mb.jpg', discard);
    expect(r.size).toBe(700_000);
    expect(resize).toHaveBeenCalledTimes(1);
  });
  it('steps down quality/size for an 18 MB source until small enough', async () => {
    const sizes = [3_000_000, 1_800_000, 900_000];
    let i = 0;
    const r = await compressToLimit(async () => ({ path: `/o${i}.jpg`, size: sizes[i++] }), '/x.jpg', discard);
    expect(r.size).toBe(900_000);
  });
  it('accepts the smallest result if under the hard limit even when above target', async () => {
    const r = await compressToLimit(async () => ({ path: '/o.jpg', size: 2_000_000 }), '/x.jpg', discard);
    expect(r.size).toBe(2_000_000);
  });
  it('throws if nothing gets below the limit', async () => {
    await expect(compressToLimit(async () => ({ path: '/o.jpg', size: 9_000_000 }), '/x.jpg', discard)).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});

const rep = (o: Partial<LocalReport>): LocalReport => ({
  id: 'x', description: 'd', createdAt: 1, state: 'queued', remoteCreated: false, attempts: 0, nextAttemptAt: 0, lastError: null, syncedAt: null, images: [], ...o,
});
describe('summarizeSync', () => {
  const base = { online: true, authPaused: false, activeReportId: null };
  it('all uploaded only when nothing is waiting', () => expect(summarizeSync({ ...base, reports: [] }).title).toBe('All reports uploaded'));
  it('offline', () => expect(summarizeSync({ ...base, online: false, reports: [rep({})] }).title).toBe('Waiting for connection'));
  it('uploading shows photo progress', () => {
    const s = summarizeSync({ ...base, activeReportId: 'x', reports: [rep({ images: [{ state: 'uploaded' }, { state: 'ready' }] as any })] });
    expect(s.tone).toBe('busy');
    expect(s.detail).toContain('1/2');
  });
  it('needs attention for failed and for auth pause', () => {
    expect(summarizeSync({ ...base, reports: [rep({ state: 'failed' })] }).tone).toBe('attention');
    expect(summarizeSync({ ...base, authPaused: true, reports: [rep({})] }).tone).toBe('attention');
  });
  it('never says "saved on phone" and "uploaded" together', () => {
    const cases = [
      summarizeSync({ ...base, reports: [] }),
      summarizeSync({ ...base, online: false, reports: [rep({})] }),
      summarizeSync({ ...base, authPaused: true, reports: [rep({})] }),
      summarizeSync({ ...base, reports: [rep({})] }),
    ];
    for (const c of cases) {
      const t = `${c.title} ${c.detail ?? ''}`.toLowerCase();
      expect(t.includes('saved on phone') && t.includes('uploaded')).toBe(false);
    }
  });
});

describe('validation + merge', () => {
  it('rejects blank description, 0 photos, 6 photos', () => {
    expect(validateDraft('   ', 1)).toEqual(['DESCRIPTION_BLANK']);
    expect(validateDraft('ok', 0)).toEqual(['NO_PHOTOS']);
    expect(validateDraft('ok', 6)).toEqual(['TOO_MANY_PHOTOS']);
    expect(validateDraft('ok', 5)).toEqual([]);
  });
  it('server wins on duplicates; local unsent show first', () => {
    const items = mergeReports(
      [rep({ id: 'a', createdAt: 5, state: 'synced' }), rep({ id: 'b', createdAt: 9 })],
      [{ id: 'a', description: '', status: 'committed', createdAt: 5, images: [] }, { id: 'c', description: '', status: 'committed', createdAt: 1, images: [] }],
    );
    expect(items.map(i => `${i.source}:${i.id}`)).toEqual(['local:b', 'server:a', 'server:c']);
  });
  it('maps server payloads defensively', () => {
    const r = mapServerReport({ id: 1, description: 'd', created_at: '2026-01-01T00:00:00Z', images: [{ id: 'i', url: 'http://u' }] });
    expect(r.createdAt).toBeGreaterThan(0);
    expect(r.images[0].url).toBe('http://u');
  });
});

describe('auth + api client', () => {
  const mk = (handler: (req: any) => any) => {
    const calls: any[] = [];
    const h: Http = async (req: any) => {
      calls.push(req);
      return handler(req);
    };
    const kv = new InMemoryReportStore();
    let signedOut = 0;
    const auth = new AuthService({
      http: h,
      kv,
      endpoints: { login: '/api/auth/login', register: '/api/auth/register', refresh: '/api/auth/refresh' },
      timeoutMs: 1,
      onSignedOut: () => void signedOut++,
    });
    const api = createApiClient({ http: h, auth, requestTimeoutMs: 1, uploadTimeoutMs: 1, readFile: async () => 'blob' });
    return { calls, kv, auth, api, signedOutCount: () => signedOut };
  };
  it('register posts name/email/password and stores token + email', async () => {
    const { auth, kv, calls } = mk(async () => ({ status: 201, data: { token: 'T1' } }));
    expect(await auth.register('Ali', 'a@b.co', 'secret123')).toBe('T1');
    expect(calls[0]).toMatchObject({ path: '/api/auth/register', json: { name: 'Ali', email: 'a@b.co', password: 'secret123' } });
    expect(await kv.getMeta('auth.token')).toBe('T1');
    expect(await auth.getEmail()).toBe('a@b.co');
    expect(await auth.getName()).toBe('Ali');
  });
  it('login posts email/password; a wrong password surfaces the 401 and stores nothing', async () => {
    const ok = mk(async () => ({ status: 200, data: { token: 'T2' } }));
    expect(await ok.auth.login('a@b.co', 'pw')).toBe('T2');
    expect(ok.calls[0]).toMatchObject({ path: '/api/auth/login', json: { email: 'a@b.co', password: 'pw' } });
    const bad = mk(async () => {
      throw new ApiError('http', 'Invalid credentials', { status: 401 });
    });
    await expect(bad.auth.login('a@b.co', 'x')).rejects.toMatchObject({ status: 401 });
    expect(await bad.auth.getToken()).toBeNull();
  });
  it('logout clears the token', async () => {
    const { auth } = mk(async () => ({ status: 200, data: { token: 'T' } }));
    await auth.login('a@b.co', 'pw');
    await auth.logout();
    expect(await auth.getToken()).toBeFalsy();
    expect(await auth.getName()).toBeNull();
  });
  it('without a token a request is an auth error (no silent account)', async () => {
    const { api, calls } = mk(async () => ({ status: 200, data: { reports: [] } }));
    await expect(api.listReports()).rejects.toMatchObject({ kind: 'auth' });
    expect(calls).toHaveLength(0);
  });
  it('deleteReport sends DELETE; a 404 (already gone) is success, other errors propagate', async () => {
    const ok = mk(async () => ({ status: 204, data: null }));
    await ok.kv.setMeta('auth.token', 'T');
    await ok.api.deleteReport('r1');
    expect(ok.calls[0]).toMatchObject({ method: 'DELETE', path: '/api/reports/r1' });
    const gone = mk(async () => {
      throw new ApiError('http', 'nf', { status: 404 });
    });
    await gone.kv.setMeta('auth.token', 'T');
    await expect(gone.api.deleteReport('r1')).resolves.toBeUndefined();
    const down = mk(async () => {
      throw new ApiError('network', 'down');
    });
    await down.kv.setMeta('auth.token', 'T');
    await expect(down.api.deleteReport('r1')).rejects.toMatchObject({ kind: 'network' });
  });
  it('a 401 triggers one refresh and a replay', async () => {
    let first = true;
    const { api, kv, calls } = mk(async (req: any) => {
      if (req.path === '/api/auth/refresh') return { status: 200, data: { token: 'NEW' } };
      if (req.token === 'OLD' && first) {
        first = false;
        throw new ApiError('http', 'expired', { status: 401 });
      }
      return { status: 200, data: { reports: [] } };
    });
    await kv.setMeta('auth.token', 'OLD');
    await api.listReports();
    expect(calls.map(c => c.path)).toEqual(['/api/reports?limit=50', '/api/auth/refresh', '/api/reports?limit=50']);
  });
  it('credentials refused for good => ApiError(auth), never a plain failure', async () => {
    const { api, kv, signedOutCount } = mk(async () => {
      throw new ApiError('http', 'no', { status: 401 });
    });
    await kv.setMeta('auth.token', 'OLD');
    await expect(api.listReports()).rejects.toMatchObject({ kind: 'auth' });
    expect(signedOutCount()).toBe(1); // UI is told to show the login screen
    expect(await kv.getMeta('auth.token')).toBeFalsy();
  });
});
