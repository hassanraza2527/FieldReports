import { ImageState, LocalImage, LocalReport, NewReportInput, ReportState } from '../../domain/types';
import { ImagePatch, ReportPatch, ReportStore } from '../ReportStore';
import { SqlDb, SqlParam } from './sqlDb';

const REPORT_COLS: Record<keyof ReportPatch, string> = {
  state: 'state',
  remoteCreated: 'remote_created',
  attempts: 'attempts',
  nextAttemptAt: 'next_attempt_at',
  lastError: 'last_error',
  syncedAt: 'synced_at',
};
const IMAGE_COLS: Record<keyof ImagePatch, string> = {
  localPath: 'local_path',
  sourcePath: 'source_path',
  sizeBytes: 'size_bytes',
  state: 'state',
};

const toImage = (r: any): LocalImage => ({
  id: r.id,
  reportId: r.report_id,
  position: r.position,
  sourcePath: r.source_path ?? null,
  localPath: r.local_path ?? null,
  sizeBytes: r.size_bytes ?? null,
  state: r.state as ImageState,
});
const toReport = (r: any, images: LocalImage[]): LocalReport => ({
  id: r.id,
  description: r.description,
  createdAt: r.created_at,
  state: r.state as ReportState,
  remoteCreated: !!r.remote_created,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  lastError: r.last_error ?? null,
  syncedAt: r.synced_at ?? null,
  images,
});

function buildSet(patch: Record<string, unknown>, cols: Record<string, string>): { sql: string; params: SqlParam[] } | null {
  const keys = Object.keys(patch).filter(k => cols[k] && patch[k] !== undefined);
  if (!keys.length) return null;
  const params = keys.map(k => {
    const v = patch[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqlParam);
  });
  return { sql: keys.map(k => `${cols[k]} = ?`).join(', '), params };
}

export class SqliteReportStore implements ReportStore {
  constructor(private db: SqlDb) {}

  async createReport(input: NewReportInput): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.run('INSERT INTO reports (id, description, created_at, state) VALUES (?, ?, ?, ?)', [
        input.id,
        input.description,
        input.createdAt,
        'queued',
      ]);
      for (let i = 0; i < input.images.length; i++) {
        await tx.run('INSERT INTO images (id, report_id, position, source_path, state) VALUES (?, ?, ?, ?, ?)', [
          input.images[i].id,
          input.id,
          i,
          input.images[i].sourcePath,
          'pending',
        ]);
      }
    });
  }

  private async hydrate(rows: any[]): Promise<LocalReport[]> {
    if (!rows.length) return [];
    const imgs = (await this.db.all('SELECT * FROM images ORDER BY report_id, position')).map(toImage);
    return rows.map(r => toReport(r, imgs.filter(i => i.reportId === r.id)));
  }

  async getReport(id: string) {
    return (await this.hydrate(await this.db.all('SELECT * FROM reports WHERE id = ?', [id])))[0] ?? null;
  }
  listReports() {
    return this.db.all('SELECT * FROM reports ORDER BY created_at DESC').then(r => this.hydrate(r));
  }
  async nextRunnable(now: number) {
    const rows = await this.db.all(
      "SELECT * FROM reports WHERE state = 'queued' AND next_attempt_at <= ? ORDER BY created_at ASC LIMIT 1",
      [now],
    );
    return (await this.hydrate(rows))[0] ?? null;
  }
  async nextWakeAt() {
    const r = await this.db.all<{ t: number | null }>("SELECT MIN(next_attempt_at) AS t FROM reports WHERE state = 'queued'");
    return r[0]?.t ?? null;
  }
  async patchReport(id: string, patch: ReportPatch) {
    const s = buildSet(patch, REPORT_COLS);
    if (s) await this.db.run(`UPDATE reports SET ${s.sql} WHERE id = ?`, [...s.params, id]);
  }
  async patchImage(id: string, patch: ImagePatch) {
    const s = buildSet(patch, IMAGE_COLS);
    if (s) await this.db.run(`UPDATE images SET ${s.sql} WHERE id = ?`, [...s.params, id]);
  }
  async pruneSynced(serverIds: string[]) {
    if (!serverIds.length) return;
    await this.db.transaction(async tx => {
      for (const id of serverIds) await tx.run("DELETE FROM reports WHERE id = ? AND state = 'synced'", [id]);
    });
  }
  async deleteReport(id: string) {
    await this.db.run('DELETE FROM reports WHERE id = ?', [id]);
  }
  async clearAll() {
    await this.db.transaction(async tx => {
      await tx.run('DELETE FROM images');
      await tx.run('DELETE FROM reports');
    });
  }
  async getMeta(key: string) {
    const r = await this.db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    return r[0]?.value ?? null;
  }
  async setMeta(key: string, value: string) {
    await this.db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }
}
