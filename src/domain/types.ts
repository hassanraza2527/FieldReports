export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 5;
/** Server rejects >= 5 MB. We aim far lower and refuse to upload anything near the limit. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SAFE_IMAGE_BYTES = 4.5 * 1024 * 1024;
export const TARGET_IMAGE_BYTES = 1024 * 1024;

/** queued = saved on phone, not yet confirmed by server. failed = needs the user. synced = server confirmed commit. */
export type ReportState = 'queued' | 'synced' | 'failed';
/** pending = original copied, not compressed yet. ready = compressed, waiting. uploaded = server has it. */
export type ImageState = 'pending' | 'ready' | 'uploaded' | 'failed';

export interface LocalImage {
  id: string;
  reportId: string;
  position: number;
  sourcePath: string | null;
  localPath: string | null;
  sizeBytes: number | null;
  state: ImageState;
}

export interface LocalReport {
  id: string;
  description: string;
  createdAt: number;
  state: ReportState;
  remoteCreated: boolean;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  syncedAt: number | null;
  images: LocalImage[];
}

export interface NewReportInput {
  id: string;
  description: string;
  createdAt: number;
  images: { id: string; sourcePath: string }[];
}

export interface ServerImage {
  id: string;
  url: string | null;
}
export interface ServerReport {
  id: string;
  description: string;
  status: string;
  createdAt: number;
  images: ServerImage[];
}
