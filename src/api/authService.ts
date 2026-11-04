import { KeyValueStore } from '../storage/ReportStore';
import { ApiError, isApiError } from './errors';
import { Http } from './http';

const K_TOKEN = 'auth.token';
const K_EMAIL = 'auth.email';
const K_NAME = 'auth.name';
const K_PENDING = 'auth.pending'; // sign-up saved on the phone, not yet created on the server

interface PendingSignup {
  name: string;
  email: string;
  password: string;
}

export interface AuthEndpoints {
  login: string;
  register: string;
  refresh: string;
}
export interface AuthDeps {
  http: Http;
  kv: KeyValueStore;
  endpoints: AuthEndpoints;
  timeoutMs: number;
  /** Called when the session is gone for good (refresh refused) so the UI can show the login screen. */
  onSignedOut?: (reason?: string) => void;
}

const is401 = (e: unknown) => isApiError(e) && e.kind === 'http' && e.status === 401;
/** No network, timeout, or a server that is down / busy: worth trying again later. */
const isTransient = (e: unknown) =>
  isApiError(e) && (e.kind === 'network' || e.kind === 'timeout' || (e.kind === 'http' && !!e.status && (e.status >= 500 || e.status === 408 || e.status === 429)));

/** Real user accounts: register / login / logout, plus a silent token refresh when a request gets a 401. */
export class AuthService {
  private inflight: Promise<string> | null = null;
  private syncing: Promise<string | null> | null = null;
  constructor(private d: AuthDeps) {}

  getToken(): Promise<string | null> {
    return this.d.kv.getMeta(K_TOKEN);
  }
  getEmail(): Promise<string | null> {
    return this.d.kv.getMeta(K_EMAIL);
  }
  async getName(): Promise<string | null> {
    return (await this.d.kv.getMeta(K_NAME)) || null;
  }

  async login(email: string, password: string): Promise<string> {
    return this.finish(email, null, await this.d.http<{ token: string; user?: { name?: string } }>({
      method: 'POST', path: this.d.endpoints.login, json: { email, password }, timeoutMs: this.d.timeoutMs,
    }));
  }

  /**
   * Returns the token, or null when the server could not be reached and the sign-up was saved on the phone instead.
   * A saved sign-up is created on the server later by syncPending().
   */
  async register(name: string, email: string, password: string): Promise<string | null> {
    try {
      return await this.finish(email, name, await this.d.http<{ token: string; user?: { name?: string } }>({
        method: 'POST', path: this.d.endpoints.register, json: { name, email, password }, timeoutMs: this.d.timeoutMs,
      }));
    } catch (e) {
      if (!isTransient(e)) throw e; // e.g. 409 email taken, 400 validation: tell the user now
      await this.d.kv.setMeta(K_PENDING, JSON.stringify({ name, email, password } satisfies PendingSignup));
      await this.d.kv.setMeta(K_EMAIL, email);
      await this.d.kv.setMeta(K_NAME, name);
      return null;
    }
  }

  async hasPending(): Promise<boolean> {
    return !!(await this.d.kv.getMeta(K_PENDING));
  }

  /** Creates the saved sign-up on the server. Token on success, null while still offline, throws ApiError('auth') if refused for good. */
  syncPending(): Promise<string | null> {
    if (!this.syncing) {
      this.syncing = this.doSyncPending().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async doSyncPending(): Promise<string | null> {
    const raw = await this.d.kv.getMeta(K_PENDING);
    if (!raw) return (await this.getToken()) || null;
    const p = JSON.parse(raw) as PendingSignup;
    const post = (path: string, json: object) =>
      this.d.http<{ token: string; user?: { name?: string } }>({ method: 'POST', path, json, timeoutMs: this.d.timeoutMs });
    try {
      let res;
      try {
        res = await post(this.d.endpoints.register, p);
      } catch (e) {
        if (!(isApiError(e) && e.kind === 'http' && e.status === 409)) throw e;
        // 409: either an earlier attempt DID create it (its answer was lost) or the email belongs to someone else.
        // Logging in with the same password tells the two apart.
        res = await post(this.d.endpoints.login, { email: p.email, password: p.password });
      }
      const token = await this.finish(p.email, p.name, res);
      await this.d.kv.setMeta(K_PENDING, '');
      return token;
    } catch (e) {
      if (isTransient(e)) return null;
      const why = isApiError(e) && e.status === 401 ? 'This email is already used by another account.' : isApiError(e) ? e.message : 'Unknown error';
      await this.logout();
      this.d.onSignedOut?.(`Your account could not be created: ${why} Please sign up again with another email.`);
      throw new ApiError('auth', 'Sign-up refused', { status: 401 });
    }
  }

  async logout(): Promise<void> {
    await this.d.kv.setMeta(K_TOKEN, '');
    await this.d.kv.setMeta(K_EMAIL, '');
    await this.d.kv.setMeta(K_NAME, '');
    await this.d.kv.setMeta(K_PENDING, '');
  }

  /** Called after a 401. Single-flight so parallel requests do not stampede the server. */
  refresh(staleToken: string | null): Promise<string> {
    if (!this.inflight) {
      this.inflight = this.doRefresh(staleToken).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async finish(email: string, name: string | null, res: { data: { token?: string; user?: { name?: string } } }): Promise<string> {
    const token = res.data?.token;
    if (!token) throw new ApiError('http', 'Server did not return a token', { status: 500 });
    await this.d.kv.setMeta(K_TOKEN, token);
    await this.d.kv.setMeta(K_EMAIL, email);
    await this.d.kv.setMeta(K_NAME, res.data.user?.name ?? name ?? '');
    return token;
  }

  private async doRefresh(staleToken: string | null): Promise<string> {
    const current = await this.d.kv.getMeta(K_TOKEN);
    if (current && current !== staleToken) return current; // someone else already refreshed
    if (!current) throw new ApiError('auth', 'Not signed in', { status: 401 });
    try {
      const r = await this.d.http<{ token: string }>({
        method: 'POST', path: this.d.endpoints.refresh, token: current, timeoutMs: this.d.timeoutMs,
      });
      await this.d.kv.setMeta(K_TOKEN, r.data.token);
      return r.data.token;
    } catch (e) {
      if (!is401(e)) throw e; // network / 5xx: keep the session, retry later
      await this.logout();
      this.d.onSignedOut?.();
      throw new ApiError('auth', 'Session expired, please log in again', { status: 401 });
    }
  }
}