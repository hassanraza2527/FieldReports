import { UploadApi } from '../api/apiClient';
import { SAFE_IMAGE_BYTES } from '../domain/types';
import { LocalImage, LocalReport } from '../domain/types';
import { ReportStore } from '../storage/ReportStore';
import { classifyError, computeBackoff, RetryConfig } from './retryPolicy';

export interface ImageCompressor {
  /** Compress `sourcePath` into `<imageId>.jpg` and return where it ended up and how big it is. */
  compress(sourcePath: string, imageId: string): Promise<{ path: string; size: number }>;
}
export interface FileOps {
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
}
export type EngineEvent = { type: 'changed' } | { type: 'synced'; reportId: string } | { type: 'idle' };

export interface EngineDeps {
  store: ReportStore;
  api: UploadApi;
  compressor: ImageCompressor;
  files: FileOps;
  isOnline: () => boolean;
  retry: RetryConfig;
  now?: () => number;
  random?: () => number;
  onEvent?: (e: EngineEvent) => void;
}

export interface EngineState {
  running: boolean;
  activeReportId: string | null;
  authPaused: boolean;
}

class CancelledError extends Error {}

/**
 * Pure TypeScript upload engine (no React, no UI). One report at a time, oldest first.
 *
 * Per report:  compress -> PUT report (idempotent) -> ask server what it has -> PUT each missing image -> commit.
 * Every step is idempotent on the server (client UUIDs + upsert), so ANY step may be repeated after a crash,
 * a dropped connection or a lost response without creating duplicates. Progress is written to SQLite after each step.
 */
export class UploadEngine {
  private running: Promise<void> | null = null;
  private rerun = false;
  private epoch = 0;
  private abort: AbortController | null = null;
  private authPaused = false;
  private activeId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private d: EngineDeps) {}

  private now = () => (this.d.now ?? Date.now)();
  private rnd = () => (this.d.random ?? Math.random)();
  private emit(e: EngineEvent) {
    this.d.onEvent?.(e);
  }

  getState(): EngineState {
    return { running: this.running !== null, activeReportId: this.activeId, authPaused: this.authPaused };
  }

  /** Safe to call from anywhere, as often as you like (submit, app start, network back, foreground, button). */
  kick(): Promise<void> {
    this.authPaused = false;
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.loop().finally(() => {
      this.running = null;
      this.activeId = null;
    });
    return this.running;
  }

  /** Cancel in-flight work and wait until it has stopped. Used by Reset. */
  async reset(): Promise<void> {
    this.epoch++;
    this.abort?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.authPaused = false;
    try {
      await this.running;
    } catch {
      /* ignore */
    }
  }

  private async loop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const epoch = this.epoch;
    do {
      this.rerun = false;
      while (this.canRun()) {
        const next = await this.d.store.nextRunnable(this.now());
        if (!next || epoch !== this.epoch) break;
        const cont = await this.process(next, epoch);
        if (!cont) break;
      }
    } while (this.rerun && epoch === this.epoch);
    this.activeId = null;
    if (epoch === this.epoch) await this.scheduleWake();
    this.emit({ type: 'idle' });
  }

  private canRun() {
    return this.d.isOnline() && !this.authPaused;
  }

  private async scheduleWake() {
    if (!this.d.isOnline() || this.authPaused) return; // network trigger / user action will kick us
    const at = await this.d.store.nextWakeAt();
    if (at === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.kick().catch(() => undefined);
    }, Math.max(at - this.now(), 250));
  }

  private alive(epoch: number) {
    if (epoch !== this.epoch) throw new CancelledError();
  }

  /** @returns false when the loop should stop. */
  private async process(initial: LocalReport, epoch: number): Promise<boolean> {
    const { store, api } = this.d;
    this.activeId = initial.id;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.emit({ type: 'changed' });
    let report = initial;
    try {
      report = await this.compressPending(report, epoch);

      if (!report.remoteCreated) {
        await api.createReport({ id: report.id, description: report.description, imageIds: report.images.map(i => i.id) }, signal);
        this.alive(epoch);
        await store.patchReport(report.id, { remoteCreated: true });
      }

      // Resume info: if a previous run already started this report (crash, force-quit, lost response, retry),
      // the server is the authority on which images it already holds.
      if (initial.remoteCreated || report.attempts > 0) {
        const status = await api.getReportStatus(report.id, signal);
        this.alive(epoch);
        await this.reconcile(report, new Set(status.receivedImageIds));
        report = (await store.getReport(report.id)) ?? report;
      }

      for (const img of report.images) {
        if (img.state === 'uploaded') continue;
        if (!img.localPath || (img.sizeBytes ?? 0) >= SAFE_IMAGE_BYTES) throw new Error('Image is not ready for upload');
        await api.uploadImage(report.id, img.id, img.localPath, signal);
        this.alive(epoch);
        await store.patchImage(img.id, { state: 'uploaded' });
        this.emit({ type: 'changed' });
      }

      await api.commitReport(report.id, signal);
      this.alive(epoch);
      await store.patchReport(report.id, { state: 'synced', syncedAt: this.now(), attempts: 0, lastError: null });
      await this.cleanupFiles(report);
      this.emit({ type: 'synced', reportId: report.id });
      this.emit({ type: 'changed' });
      return true;
    } catch (err) {
      if (err instanceof CancelledError) return false;
      return this.handleFailure(report, err, epoch);
    }
  }

  private async reconcile(report: LocalReport, received: Set<string>) {
    for (const img of report.images) {
      if (img.state === 'uploaded' && !received.has(img.id)) await this.d.store.patchImage(img.id, { state: 'ready' }); // server lost it
      else if (img.state === 'ready' && received.has(img.id)) await this.d.store.patchImage(img.id, { state: 'uploaded' }); // response was lost
    }
  }

  private async compressPending(report: LocalReport, epoch: number): Promise<LocalReport> {
    for (const img of report.images) {
      if (img.state !== 'pending') continue;
      if (!img.sourcePath || !(await this.d.files.exists(img.sourcePath))) {
        await this.d.store.patchImage(img.id, { state: 'failed' });
        throw Object.assign(new Error('A photo file is missing from the phone.'), { permanentLocal: true });
      }
      const out = await this.d.compressor.compress(img.sourcePath, img.id);
      this.alive(epoch);
      if (out.size >= SAFE_IMAGE_BYTES) throw Object.assign(new Error('Photo is still too large after compression.'), { permanentLocal: true });
      await this.d.store.patchImage(img.id, { localPath: out.path, sizeBytes: out.size, state: 'ready' });
      this.emit({ type: 'changed' });
    }
    return (await this.d.store.getReport(report.id)) ?? report;
  }

  private async handleFailure(report: LocalReport, err: unknown, epoch: number): Promise<boolean> {
    const { store } = this.d;
    if (epoch !== this.epoch) return false;
    const message = err instanceof Error ? err.message : 'Unknown error';
    const verdict = (err as any)?.permanentLocal
      ? ({ action: 'permanent', message } as const)
      : classifyError(err, { attempts: report.attempts, maxLocalFailures: this.d.retry.maxLocalFailures });

    switch (verdict.action) {
      case 'cancelled':
        return false;
      case 'auth':
        this.authPaused = true; // report stays queued and untouched
        this.emit({ type: 'changed' });
        return false;
      case 'permanent':
        await store.patchReport(report.id, { state: 'failed', lastError: verdict.message });
        break;
      case 'resync': {
        if (verdict.reason === 'report_missing') await store.patchReport(report.id, { remoteCreated: false });
        const fresh = (await store.getReport(report.id)) ?? report;
        for (const i of fresh.images) if (i.state === 'uploaded') await store.patchImage(i.id, { state: 'ready' });
        // Known, fixable state: retry right away for the first few rounds, then fall back to backoff (no hot loop).
        await this.backoff(report, message, undefined, report.attempts < 3);
        break;
      }
      case 'retry':
        await this.backoff(report, message, verdict.retryAfterMs);
        break;
    }
    this.emit({ type: 'changed' });
    return true;
  }

  private async backoff(report: LocalReport, message: string, retryAfterMs?: number, immediate = false) {
    const attempts = report.attempts + 1;
    const delay = immediate ? 0 : computeBackoff(report.attempts, this.rnd, this.d.retry, retryAfterMs);
    await this.d.store.patchReport(report.id, { attempts, nextAttemptAt: this.now() + delay, lastError: message });
  }

  private async cleanupFiles(report: LocalReport) {
    const paths = report.images.flatMap((i: LocalImage) => [i.localPath, i.sourcePath]).filter((p): p is string => !!p);
    await Promise.all(paths.map(p => this.d.files.remove(p).catch(() => undefined)));
  }
}
