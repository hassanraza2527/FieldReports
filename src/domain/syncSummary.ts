import { LocalReport } from './types';

export type SyncTone = 'ok' | 'busy' | 'waiting' | 'attention';
export interface SyncSummary {
  tone: SyncTone;
  title: string;
  detail?: string;
}
export interface SyncInput {
  reports: LocalReport[];
  online: boolean;
  authPaused: boolean;
  activeReportId: string | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Wording rule: "saved on phone" and "uploaded" never appear in the same sentence/state.
 * "Uploaded" is only said when nothing is waiting any more.
 */
export function summarizeSync(i: SyncInput): SyncSummary {
  const failed = i.reports.filter(r => r.state === 'failed');
  const queued = i.reports.filter(r => r.state === 'queued');

  if (i.authPaused) {
    return {
      tone: 'attention',
      title: 'Upload paused',
      detail: `Could not sign in to the server. ${plural(queued.length, 'report is', 'reports are')} saved on phone.`,
    };
  }
  if (failed.length > 0) {
    return {
      tone: 'attention',
      title: `${plural(failed.length, 'report needs', 'reports need')} attention`,
      detail: queued.length > 0 ? `${queued.length} more waiting to upload.` : undefined,
    };
  }
  if (queued.length === 0) return { tone: 'ok', title: 'All reports uploaded' };
  if (!i.online) {
    return {
      tone: 'waiting',
      title: 'Waiting for connection',
      detail: `${plural(queued.length, 'report', 'reports')} saved on phone.`,
    };
  }
  const active = queued.find(r => r.id === i.activeReportId);
  if (active) {
    const done = active.images.filter(x => x.state === 'uploaded').length;
    return {
      tone: 'busy',
      title: `Uploading ${plural(queued.length, 'report', 'reports')}`,
      detail: `Photos ${done}/${active.images.length} sent for the current report.`,
    };
  }
  return {
    tone: 'waiting',
    title: 'Will retry shortly',
    detail: `${plural(queued.length, 'report', 'reports')} saved on phone.`,
  };
}
