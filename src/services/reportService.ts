import { validateDraft } from '../domain/validation';
import { ReportStore } from '../storage/ReportStore';
import { UploadEngine } from '../upload/engine';

export class DraftInvalidError extends Error {}

export interface ReportServiceDeps {
  store: ReportStore;
  engine: UploadEngine;
  files: { remove(path: string): Promise<void>; clearAll(): Promise<void> };
  newId: () => string;
  now?: () => number;
  afterChange: () => void;
}

export function createReportService(d: ReportServiceDeps) {
  const now = () => (d.now ?? Date.now)();
  const swallow = () => undefined;

  return {
    /**
     * ONE SQLite transaction (report + every image row). When this resolves the report is durable:
     * the UI may say "Saved on phone". Compression and upload happen afterwards in the background.
     */
    async submit(input: { description: string; photoPaths: { id: string; path: string }[] }): Promise<string> {
      const description = input.description.trim();
      if (validateDraft(description, input.photoPaths.length).length) throw new DraftInvalidError('Draft is not valid');
      const id = d.newId();
      await d.store.createReport({
        id,
        description,
        createdAt: now(),
        images: input.photoPaths.map(p => ({ id: p.id, sourcePath: p.path })),
      });
      d.afterChange();
      d.engine.kick().catch(swallow);
      return id;
    },

    /** User pressed Retry on a report that needed attention. */
    async retry(id: string) {
      const r = await d.store.getReport(id);
      if (!r) return;
      for (const i of r.images) if (i.state === 'failed' && i.sourcePath) await d.store.patchImage(i.id, { state: 'pending' });
      await d.store.patchReport(id, { state: 'queued', attempts: 0, nextAttemptAt: 0, lastError: null });
      d.afterChange();
      d.engine.kick().catch(swallow);
    },

    /** Explicit, user-confirmed delete of ONE unsent report. Nothing is ever dropped silently. */
    async discard(id: string) {
      const r = await d.store.getReport(id);
      if (!r) return;
      await Promise.all(r.images.flatMap(i => [i.localPath, i.sourcePath]).filter((p): p is string => !!p).map(p => d.files.remove(p).catch(swallow)));
      await d.store.deleteReport(id);
      d.afterChange();
    },

    /** Server list proves these are uploaded: their local rows are no longer needed. */
    async pruneConfirmed(serverIds: string[]) {
      await d.store.pruneSynced(serverIds);
      d.afterChange();
    },

    /**
     * RESET SCOPE: deletes this phone's queue (reports + image rows), all local photo files, and the unsent draft.
     * Does NOT touch the server and does NOT delete the device account (so Review keeps working afterwards).
     */
    async resetLocalData() {
      await d.engine.reset();
      await d.store.clearAll();
      await d.files.clearAll();
      d.afterChange();
    },
  };
}
export type ReportService = ReturnType<typeof createReportService>;
