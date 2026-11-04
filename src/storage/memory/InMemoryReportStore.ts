import { LocalImage, LocalReport, NewReportInput } from '../../domain/types';
import { ImagePatch, ReportPatch, ReportStore } from '../ReportStore';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Test double with the same contract as the SQLite store. Survives "app restarts" if the instance is reused. */
export class InMemoryReportStore implements ReportStore {
  private reports = new Map<string, LocalReport>();
  private meta = new Map<string, string>();

  async createReport(input: NewReportInput) {
    const images: LocalImage[] = input.images.map((im, position) => ({
      id: im.id,
      reportId: input.id,
      position,
      sourcePath: im.sourcePath,
      localPath: null,
      sizeBytes: null,
      state: 'pending',
    }));
    this.reports.set(input.id, {
      id: input.id,
      description: input.description,
      createdAt: input.createdAt,
      state: 'queued',
      remoteCreated: false,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      syncedAt: null,
      images,
    });
  }
  async getReport(id: string) {
    const r = this.reports.get(id);
    return r ? clone(r) : null;
  }
  async listReports() {
    return [...this.reports.values()].map(clone).sort((a, b) => b.createdAt - a.createdAt);
  }
  async nextRunnable(now: number) {
    const c = [...this.reports.values()]
      .filter(r => r.state === 'queued' && r.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt);
    return c[0] ? clone(c[0]) : null;
  }
  async nextWakeAt() {
    const t = [...this.reports.values()].filter(r => r.state === 'queued').map(r => r.nextAttemptAt);
    return t.length ? Math.min(...t) : null;
  }
  async patchReport(id: string, patch: ReportPatch) {
    const r = this.reports.get(id);
    if (r) Object.assign(r, patch);
  }
  async patchImage(id: string, patch: ImagePatch) {
    for (const r of this.reports.values()) {
      const im = r.images.find(x => x.id === id);
      if (im) Object.assign(im, patch);
    }
  }
  async pruneSynced(ids: string[]) {
    for (const id of ids) if (this.reports.get(id)?.state === 'synced') this.reports.delete(id);
  }
  async deleteReport(id: string) {
    this.reports.delete(id);
  }
  async clearAll() {
    this.reports.clear();
  }
  async getMeta(k: string) {
    return this.meta.get(k) ?? null;
  }
  async setMeta(k: string, v: string) {
    this.meta.set(k, v);
  }
}
