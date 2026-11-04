import { KeyValueStore } from '../storage/ReportStore';
import { ApiError, isApiError } from './errors';
import { Http } from './http';

const K_TOKEN = 'auth.token';
const K_EMAIL = 'auth.email';
const K_NAME = 'auth.name';

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
  onSignedOut?: () => void;
}

const is401 = (e: unknown) => isApiError(e) && e.kind === 'http' && e.status === 401;

/** Real user accounts: register / login / logout, plus a silent token refresh when a request gets a 401. */
export class AuthService {
  private inflight: Promise<string> | null = null;
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

  async register(name: string, email: string, password: string): Promise<string> {
    return this.finish(email, name, await this.d.http<{ token: string; user?: { name?: string } }>({
      method: 'POST', path: this.d.endpoints.register, json: { name, email, password }, timeoutMs: this.d.timeoutMs,
    }));
  }

  async logout(): Promise<void> {
    await this.d.kv.setMeta(K_TOKEN, '');
    await this.d.kv.setMeta(K_EMAIL, '');
    await this.d.kv.setMeta(K_NAME, '');
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
