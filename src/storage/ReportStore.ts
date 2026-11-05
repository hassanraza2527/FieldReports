import { LocalImage, LocalReport, NewReportInput } from '../domain/types';

export type ReportPatch = Partial<
  Pick<LocalReport, 'state' | 'remoteCreated' | 'attempts' | 'nextAttemptAt' | 'lastError' | 'syncedAt'>
>;
export type ImagePatch = Partial<Pick<LocalImage, 'localPath' | 'sourcePath' | 'sizeBytes' | 'state'>>;

export interface KeyValueStore {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

/** Port. SQLite implements it for the app; an in-memory twin is used by tests. */
export interface ReportStore extends KeyValueStore {
  /** Atomic: the report row and ALL image rows are written together or not at all. */
  createReport(input: NewReportInput): Promise<void>;
  getReport(id: string): Promise<LocalReport | null>;
  listReports(): Promise<LocalReport[]>;
  nextRunnable(now: number): Promise<LocalReport | null>;
  /** Earliest nextAttemptAt among queued reports (for the wake-up timer). */
  nextWakeAt(): Promise<number | null>;
  patchReport(id: string, patch: ReportPatch): Promise<void>;
  patchImage(id: string, patch: ImagePatch): Promise<void>;
  /** Remove local rows the server has confirmed in its list. */
  pruneSynced(serverIds: string[]): Promise<void>;
  deleteReport(id: string): Promise<void>;
  /** Deletes reports + images. Keeps meta (the silent device account's token) on purpose. */
  clearAll(): Promise<void>;
}
