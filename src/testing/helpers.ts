import { UploadApi } from '../api/apiClient';
import { ApiError } from '../api/errors';
import { NewReportInput } from '../domain/types';
import { InMemoryReportStore } from '../storage/memory/InMemoryReportStore';
import { EngineEvent, UploadEngine } from '../upload/engine';

export type Fault = 'network' | 'lose' | { status: number } | 'auth';
type Op = 'create' | 'status' | 'upload' | 'commit';

export class FakeServer implements UploadApi {
  reports = new Map<string, { description: string; imageIds: string[]; received: Set<string>; committed: boolean }>();
  calls: Record<Op, number> = { create: 0, status: 0, upload: 0, commit: 0 };
  faults: Record<Op, Fault[]> = { create: [], status: [], upload: [], commit: [] };
  concurrent = 0;
  maxConcurrent = 0;
  onUpload?: (reportId: string, imageId: string) => void;

  private async run<T>(op: Op, fn: () => T): Promise<T> {
    this.calls[op]++;
    this.concurrent++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    try {
      await Promise.resolve();
      const f = this.faults[op].shift();
      if (f === 'network') throw new ApiError('network', 'down');
      if (f === 'auth') throw new ApiError('auth', 'nope');
      if (f && typeof f === 'object') throw new ApiError('http', `HTTP ${f.status}`, { status: f.status });
      const out = fn();
      if (f === 'lose') throw new ApiError('timeout', 'response lost'); // server DID apply it
      return out;
    } finally {
      this.concurrent--;
    }
  }
  createReport(i: { id: string; description: string; imageIds: string[] }) {
    return this.run('create', () => {
      if (!this.reports.has(i.id)) this.reports.set(i.id, { description: i.description, imageIds: i.imageIds, received: new Set(), committed: false });
    });
  }
  getReportStatus(id: string) {
    return this.run('status', () => {
      const r = this.reports.get(id);
      if (!r) throw new ApiError('http', 'nf', { status: 404 });
      return { status: r.committed ? 'committed' : 'pending', receivedImageIds: [...r.received] };
    });
  }
  uploadImage(reportId: string, imageId: string) {
    return this.run('upload', () => {
      const r = this.reports.get(reportId);
      if (!r) throw new ApiError('http', 'nf', { status: 404 });
      r.received.add(imageId);
      this.onUpload?.(reportId, imageId);
    });
  }
  commitReport(id: string) {
    return this.run('commit', () => {
      const r = this.reports.get(id);
      if (!r) throw new ApiError('http', 'nf', { status: 404 });
      if (r.imageIds.some(x => !r.received.has(x))) throw new ApiError('http', 'missing', { status: 409 });
      r.committed = true;
    });
  }
}

export interface Harness {
  store: InMemoryReportStore;
  server: FakeServer;
  files: Set<string>;
  clock: { t: number };
  net: { online: boolean };
  events: EngineEvent[];
  compressed: string[];
  makeEngine(): UploadEngine;
  engine: UploadEngine;
  submit(id: string, images?: number, description?: string): Promise<NewReportInput>;
}

export function harness(): Harness {
  const store = new InMemoryReportStore();
  const server = new FakeServer();
  const files = new Set<string>();
  const clock = { t: 1_000_000 };
  const net = { online: true };
  const events: EngineEvent[] = [];
  const compressed: string[] = [];
  const makeEngine = () =>
    new UploadEngine({
      store,
      api: server,
      files: { exists: async p => files.has(p), remove: async p => void files.delete(p) },
      compressor: {
        compress: async (src, id) => {
          compressed.push(id);
          files.add(`/c/${id}.jpg`);
          return { path: `/c/${id}.jpg`, size: 800_000 };
        },
      },
      isOnline: () => net.online,
      retry: { baseDelayMs: 1000, maxDelayMs: 300_000, minDelayMs: 500, maxLocalFailures: 8 },
      now: () => clock.t,
      random: () => 0.5,
      onEvent: e => events.push(e),
    });
  const h: Harness = {
    store, server, files, clock, net, events, compressed, makeEngine,
    engine: makeEngine(),
    async submit(id, n = 2, description = 'Cracked pipe') {
      const images = Array.from({ length: n }, (_, k) => ({ id: `${id}-img${k + 1}`, sourcePath: `/src/${id}-${k + 1}.jpg` }));
      images.forEach(i => files.add(i.sourcePath));
      const input = { id, description, createdAt: clock.t++, images };
      await store.createReport(input);
      return input;
    },
  };
  return h;
}
