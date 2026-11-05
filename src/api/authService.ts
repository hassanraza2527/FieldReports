import { KeyValueStore } from '../storage/ReportStore';
import { ApiError, isApiError } from './errors';
import { Http } from './http';

const K_TOKEN = 'auth.token';
const K_DEVICE = 'auth.device'; // this phone's own credentials, kept so a lost session can be re-opened silently
const K_PENDING = 'auth.pending'; // account saved on the phone, not yet created on the server (created offline)

interface Credentials {
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
  /** Random id source (uuid) used to make the device's credentials. */
  newId: () => string;
}

type TokenResponse = { data: { token?: string } };
const is401 = (e: unknown) => isApiError(e) && e.kind === 'http' && e.status === 401;
/** No network, timeout, or a server that is down / busy: worth trying again later. */
const isTransient = (e: unknown) =>
  isApiError(e) && (e.kind === 'network' || e.kind === 'timeout' || (e.kind === 'http' && !!e.status && (e.status >= 500 || e.status === 408 || e.status === 429)));

/**
 * Silent DEVICE account. The brief has no login, but the backend wants a token, so the app creates its own account
 * the first time it needs one (even offline: the sign-up is saved and created later) and never shows a screen for it.
 * Token lost / expired -> refresh, and if that is refused, log in again with the phone's own credentials.
 */
export class AuthService {
  private inflight: Promise<string> | null = null;
  private syncing: Promise<string | null> | null = null;
  constructor(private d: AuthDeps) {}

  getToken(): Promise<string | null> {
    return this.d.kv.getMeta(K_TOKEN).then(t => t || null);
  }

  async hasPending(): Promise<boolean> {
    return !!(await this.d.kv.getMeta(K_PENDING));
  }

  /**
   * Makes sure this phone has (or is about to have) an account. No-op if it already has a token or a saved sign-up.
   * Offline is fine: the sign-up is saved and syncPending() creates it later.
   * Throws ApiError('auth') only if the server refuses to create the account for good.
   */
  async ensureAccount(): Promise<void> {
    if ((await this.getToken()) || (await this.hasPending())) return;
    const c: Credentials = { name: 'Field inspector', email: `device-${this.d.newId()}@fieldreports.dev`, password: `${this.d.newId()}${this.d.newId()}` };
    await this.d.kv.setMeta(K_DEVICE, JSON.stringify(c));
    try {
      await this.finish(await this.post(this.d.endpoints.register, c));
    } catch (e) {
      if (!isTransient(e)) {
        await this.forget();
        throw new ApiError('auth', 'Account was refused by the server', { status: 401 });
      }
      await this.d.kv.setMeta(K_PENDING, JSON.stringify(c)); // offline: created later
    }
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
    if (!raw) return this.getToken();
    const c = JSON.parse(raw) as Credentials;
    try {
      let res: TokenResponse;
      try {
        res = await this.post(this.d.endpoints.register, c);
      } catch (e) {
        if (!(isApiError(e) && e.kind === 'http' && e.status === 409)) throw e;
        // 409: an earlier attempt DID create it and its answer was lost. Same password => it is ours.
        res = await this.post(this.d.endpoints.login, { email: c.email, password: c.password });
      }
      const token = await this.finish(res);
      await this.d.kv.setMeta(K_PENDING, '');
      return token;
    } catch (e) {
      if (isTransient(e)) return null;
      await this.forget(); // refused for good: the next request makes a brand-new device account
      throw new ApiError('auth', 'Account was refused by the server', { status: 401 });
    }
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

  private async doRefresh(staleToken: string | null): Promise<string> {
    const current = await this.getToken();
    if (current && current !== staleToken) return current; // someone else already refreshed
    if (current) {
      try {
        const r = await this.d.http<{ token: string }>({ method: 'POST', path: this.d.endpoints.refresh, token: current, timeoutMs: this.d.timeoutMs });
        await this.d.kv.setMeta(K_TOKEN, r.data.token);
        return r.data.token;
      } catch (e) {
        if (!is401(e)) throw e; // network / 5xx: keep the session, retry later
      }
    }
    return this.reauthenticate();
  }

  /** Refresh refused (or no token): open a new session with this phone's own credentials. Never shows UI. */
  private async reauthenticate(): Promise<string> {
    const raw = await this.d.kv.getMeta(K_DEVICE);
    if (!raw) throw new ApiError('auth', 'No device account', { status: 401 });
    const c = JSON.parse(raw) as Credentials;
    try {
      return await this.finish(await this.post(this.d.endpoints.login, { email: c.email, password: c.password }));
    } catch (e) {
      if (!is401(e)) throw e;
    }
    try {
      return await this.finish(await this.post(this.d.endpoints.register, c)); // server forgot us (e.g. it was wiped)
    } catch (e) {
      if (isTransient(e)) throw e;
      throw new ApiError('auth', 'Account was refused by the server', { status: 401 });
    }
  }

  private post(path: string, json: object): Promise<TokenResponse> {
    return this.d.http<{ token?: string }>({ method: 'POST', path, json, timeoutMs: this.d.timeoutMs });
  }

  private async finish(res: TokenResponse): Promise<string> {
    const token = res.data?.token;
    if (!token) throw new ApiError('http', 'Server did not return a token', { status: 500 });
    await this.d.kv.setMeta(K_TOKEN, token);
    return token;
  }

  private async forget() {
    for (const k of [K_TOKEN, K_DEVICE, K_PENDING]) await this.d.kv.setMeta(k, '');
  }
}
