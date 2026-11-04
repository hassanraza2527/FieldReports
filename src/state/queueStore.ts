import { create } from 'zustand';
import { LocalReport } from '../domain/types';

/** Client-state MIRROR of SQLite + engine. SQLite stays the source of truth; this exists so React can subscribe. */
interface QueueState {
  ready: boolean;
  reports: LocalReport[];
  online: boolean;
  authPaused: boolean;
  activeReportId: string | null;
}
export const useQueueStore = create<QueueState>(() => ({
  ready: false,
  reports: [],
  online: true,
  authPaused: false,
  activeReportId: null,
}));
