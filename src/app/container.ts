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
import { useDraftStore } from '../state/draftStore';
import { useQueueStore } from '../state/queueStore';
import { migrate } from '../storage/sqlite/migrations';
import { openDatabase } from '../storage/sqlite/opSqliteAdapter';
import { SqliteReportStore } from '../storage/sqlite/SqliteReportStore';
import { UploadEngine } from '../upload/engine';
import { startTriggers } from '../upload/triggers';

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
    newId,
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
        if (o) void auth.syncPending().catch(() => undefined); // the device account saved offline is created as soon as we are back online
        useQueueStore.setState({ online: o });
      },
    });
    await refresh();
    useQueueStore.setState({ ready: true });
    // Silent device account: created offline if need be, never a screen. Failure here must not block the app.
    await auth.ensureAccount().catch(() => undefined);
    void auth.syncPending().catch(() => undefined);
    void engine.kick(); // resume whatever was left in SQLite before the app was closed / killed
  }

  const resetEverythingLocal = async () => {
    await service.resetLocalData();
    useDraftStore.getState().clear();
  };

  return { store, engine, service, reviewApi: api, start, resetEverythingLocal, baseUrl: config.baseUrl };
}
export type Container = ReturnType<typeof createContainer>;

let instance: Container | null = null;
export const getContainer = (): Container => {
  if (!instance) instance = createContainer();
  return instance;
};
export const bootstrap = () => getContainer().start();