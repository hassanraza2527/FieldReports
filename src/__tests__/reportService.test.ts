import { createReportService, DraftInvalidError } from '../services/reportService';
import { harness } from '../testing/helpers';

jest.useFakeTimers();
const setup = () => {
  const h = harness();
  const removed: string[] = [];
  let n = 0;
  const service = createReportService({
    store: h.store,
    engine: h.engine,
    files: { remove: async p => void removed.push(p), clearAll: async () => void h.files.clear() },
    newId: () => `rep${++n}`,
    now: () => h.clock.t,
    afterChange: () => undefined,
  });
  return { h, service, removed };
};
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, path: `/pending/p${i}.jpg` }));

describe('reportService', () => {
  it('rejects invalid drafts before anything is written', async () => {
    const { h, service } = setup();
    await expect(service.submit({ description: '  ', photoPaths: photos(1) })).rejects.toBeInstanceOf(DraftInvalidError);
    await expect(service.submit({ description: 'x', photoPaths: [] })).rejects.toBeInstanceOf(DraftInvalidError);
    await expect(service.submit({ description: 'x', photoPaths: photos(6) })).rejects.toBeInstanceOf(DraftInvalidError);
    expect(await h.store.listReports()).toHaveLength(0);
    await h.engine.reset();
  });
  it('submit persists immediately (even offline) and uploads later', async () => {
    const { h, service } = setup();
    h.net.online = false;
    photos(2).forEach(p => h.files.add(p.path));
    const id = await service.submit({ description: ' Leaking valve ', photoPaths: photos(2) });
    const saved = (await h.store.getReport(id))!;
    expect(saved).toMatchObject({ state: 'queued', description: 'Leaking valve' });
    expect(saved.images).toHaveLength(2);
    expect(h.server.calls.create).toBe(0);
    h.net.online = true;
    await h.engine.kick();
    expect((await h.store.getReport(id))!.state).toBe('synced');
    await h.engine.reset();
  });
  it('retry re-queues a failed report; discard removes it and its files', async () => {
    const { h, service, removed } = setup();
    photos(1).forEach(p => h.files.add(p.path));
    const id = await service.submit({ description: 'x', photoPaths: photos(1) });
    await h.engine.reset();
    await h.store.patchReport(id, { state: 'failed', lastError: 'boom' });
    await service.retry(id);
    expect((await h.store.getReport(id))!).toMatchObject({ state: 'queued', lastError: null, attempts: 0 });
    await h.engine.reset();
    await service.discard(id);
    expect(await h.store.getReport(id)).toBeNull();
    expect(removed).toContain('/pending/p0.jpg');
  });
  it('reset clears the queue and files but keeps the device account', async () => {
    const { h, service } = setup();
    await h.store.setMeta('auth.token', 'T');
    photos(1).forEach(p => h.files.add(p.path));
    await service.submit({ description: 'x', photoPaths: photos(1) });
    await service.resetLocalData();
    expect(await h.store.listReports()).toHaveLength(0);
    expect(h.files.size).toBe(0);
    expect(await h.store.getMeta('auth.token')).toBe('T');
    expect(h.server.reports.size).toBe(0); // server untouched by design (nothing was uploaded here, nothing was deleted there)
  });
});
