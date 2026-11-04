import { createApiClient } from '../api/apiClient';
import { AuthService } from '../api/authService';
import { createHttp } from '../api/http';
import { config } from '../config/env';
import { imageCompressor } from '../images/imageProcessor';
import { configureNetInfo, watchAppActive, watchNetwork } from '../platform/network';
import { files } from '../platform/files';
import { newId } from '../platform/ids';
import { queryClient, SERVER_REPORTS_KEY } from '../queries/queryClient';
import { createReportService } from '../services/reportService';
import { useAuthStore } from '../state/authStore';
import { useDraftStore } from '../state/draftStore';
import { useQueueStore } from '../state/queueStore';
import { migrate } from '../storage/sqlite/migrations';
import { openDatabase } from '../storage/sqlite/opSqliteAdapter';
import { SqliteReportStore } from '../storage/sqlite/SqliteReportStore';
import { UploadEngine } from '../upload/engine';
import { startTriggers } from '../upload/triggers';

const K_ONBOARDED = 'onboarding.done';

/** Composition root: the only place where concrete implementations are wired together. */
export function createContainer() {
  const db = openDatabase();
  const store = new SqliteReportStore(db);
  let online = true;

  const http = createHttp({ baseUrl: config.baseUrl });
  const auth = new AuthService({
    http,
    kv: store,
    endpoints: config.authEndpoints,
    timeoutMs: config.requestTimeoutMs,
    onSignedOut: reason => useAuthStore.setState({ status: 'signedOut', email: null, name: null, notice: reason ?? null }),
  });
  const api = createApiClient({ http, auth, requestTimeoutMs: config.requestTimeoutMs, uploadTimeoutMs: config.uploadTimeoutMs });

  // Coalesced mirror refresh: many engine events -> at most one DB read in flight + one queued.
  let refreshing = false;
  let again = false;
  const refresh = async (): Promise<void> => {
    if (refreshing) {
      again = true;
      return;
    }
    refreshing = true;
    try {
      do {
        again = false;
        const reports = await store.listReports();
        const es = engine.getState();
        useQueueStore.setState({ reports, authPaused: es.authPaused, activeReportId: es.activeReportId });
      } while (again);
    } finally {
      refreshing = false;
    }
  };

  const engine: UploadEngine = new UploadEngine({
    store,
    api,
    files,
    compressor: imageCompressor,
    isOnline: () => online,
    retry: config.retry,
    onEvent: e => {
      void refresh();
      if (e.type === 'synced') void queryClient.invalidateQueries({ queryKey: SERVER_REPORTS_KEY });
    },
  });

  const service = createReportService({ store, engine, files, newId, afterChange: () => void refresh() });

  async function start() {
    await migrate(db);
    await files.ensureDirs();
    configureNetInfo();
    startTriggers({
      engine,
      watchNetwork,
      watchAppActive,
      onOnlineChange: o => {
        online = o;
        if (o) void auth.syncPending().catch(() => undefined); // a sign-up saved offline is created as soon as we are back online
        useQueueStore.setState({ online: o });
      },
    });
    await refresh();
    useQueueStore.setState({ ready: true });
    const onboarded = (await store.getMeta(K_ONBOARDED)) === '1';
    const token = await auth.getToken();
    const pending = await auth.hasPending();
    if (token || pending) {
      useAuthStore.setState({ onboarded, status: 'signedIn', email: await auth.getEmail(), name: await auth.getName() });
      if (pending) void auth.syncPending().catch(() => undefined);
      void engine.kick(); // resume whatever was left in SQLite before the app was closed / killed
    } else {
      useAuthStore.setState({ onboarded, status: 'signedOut', email: null, name: null });
    }
  }

  const completeOnboarding = async () => {
    await store.setMeta(K_ONBOARDED, '1');
    useAuthStore.setState({ onboarded: true });
  };

  const signedIn = async () => {
    queryClient.clear();
    useAuthStore.setState({ status: 'signedIn', email: await auth.getEmail(), name: await auth.getName(), notice: null });
    void engine.kick(); // reports saved earlier now have a token
  };
  const login = async (email: string, password: string) => {
    await auth.login(email, password);
    await signedIn();
  };
  const register = async (name: string, email: string, password: string) => {
    await auth.register(name, email, password);
    await signedIn();
  };
  /** Removes this phone's queue first, so one user's unsent reports are never uploaded under the next account. */
  const logout = async () => {
    await service.resetLocalData();
    useDraftStore.getState().clear();
    await auth.logout();
    queryClient.clear();
    useAuthStore.setState({ status: 'signedOut', email: null, name: null });
  };

  const resetEverythingLocal = async () => {
    await service.resetLocalData();
    useDraftStore.getState().clear();
  };

  return { store, engine, service, reviewApi: api, start, resetEverythingLocal, login, register, logout, completeOnboarding, baseUrl: config.baseUrl };
}
export type Container = ReturnType<typeof createContainer>;

let instance: Container | null = null;
export const getContainer = (): Container => {
  if (!instance) instance = createContainer();
  return instance;
};
export const bootstrap = () => getContainer().start();