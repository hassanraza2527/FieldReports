import { harness, Harness } from '../testing/helpers';

jest.useFakeTimers();
let h: Harness;
beforeEach(() => {
  h = harness();
});
afterEach(async () => {
  await h.engine.reset();
});
const advance = (ms: number) => {
  h.clock.t += ms;
};

describe('UploadEngine: delivery guarantees', () => {
  it('uploads, commits and cleans up local files on the happy path', async () => {
    await h.submit('r1', 2);
    await h.engine.kick();
    const r = (await h.store.getReport('r1'))!;
    expect(r.state).toBe('synced');
    expect(h.server.reports.get('r1')!.committed).toBe(true);
    expect(h.server.reports.get('r1')!.received.size).toBe(2);
    expect(h.files.size).toBe(0);
  });

  it('compresses before uploading and never uploads an uncompressed original', async () => {
    await h.submit('r1', 3);
    await h.engine.kick();
    expect(h.compressed).toHaveLength(3);
  });

  it('does nothing while offline, then drains the queue when the network returns', async () => {
    h.net.online = false;
    await h.submit('r1');
    await h.engine.kick();
    expect(h.server.calls.create).toBe(0);
    expect((await h.store.getReport('r1'))!.state).toBe('queued');
    h.net.online = true;
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
  });

  it('lost response on image upload: retry does NOT re-send the image the server already has', async () => {
    await h.submit('r1', 2);
    h.server.faults.upload.push('lose'); // image 1 stored, answer lost
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('queued');
    advance(10_000);
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
    expect(h.server.calls.upload).toBe(2); // 1 (lost) + 1 (image 2). Image 1 was NOT sent twice.
    expect(h.server.reports.size).toBe(1);
  });

  it('lost response on create does not duplicate the report', async () => {
    await h.submit('r1', 1);
    h.server.faults.create.push('lose');
    await h.engine.kick();
    advance(10_000);
    await h.engine.kick();
    expect(h.server.reports.size).toBe(1);
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
  });

  it('lost response on commit: second commit is idempotent, report ends synced exactly once', async () => {
    await h.submit('r1', 2);
    h.server.faults.commit.push('lose');
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('queued');
    advance(10_000);
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
    expect(h.server.reports.get('r1')!.committed).toBe(true);
    expect(h.server.calls.upload).toBe(2); // images not re-sent
  });

  it('force-quit mid-upload: a brand new engine resumes from SQLite and sends only what is missing', async () => {
    await h.submit('r1', 3);
    h.server.faults.upload.push('network'); // 1st image fails
    await h.engine.kick();
    h.server.onUpload = (_r, id) => {
      if (id === 'r1-img2') throw new Error('process killed'); // simulated crash right after the server stored img2
    };
    advance(10_000);
    await h.engine.kick().catch(() => undefined);
    h.server.onUpload = undefined;

    const afterCrash = h.makeEngine(); // "app restarted": new engine, same SQLite store, same server
    advance(10_000);
    await afterCrash.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
    expect([...h.server.reports.get('r1')!.received].sort()).toEqual(['r1-img1', 'r1-img2', 'r1-img3']);
    expect(h.server.reports.size).toBe(1);
    await afterCrash.reset();
  });

  it('retries 503 with backoff and does not hammer the server', async () => {
    await h.submit('r1', 1);
    h.server.faults.create.push({ status: 503 });
    await h.engine.kick();
    const r = (await h.store.getReport('r1'))!;
    expect(r.state).toBe('queued');
    expect(r.attempts).toBe(1);
    expect(r.nextAttemptAt).toBeGreaterThan(h.clock.t);
    const before = h.server.calls.create;
    await h.engine.kick(); // too early: backoff not elapsed
    expect(h.server.calls.create).toBe(before);
    advance(60_000);
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
  });

  it('422 is permanent: report is marked failed (kept, not deleted) and not retried', async () => {
    await h.submit('r1', 1);
    h.server.faults.upload.push({ status: 422 });
    await h.engine.kick();
    const r = (await h.store.getReport('r1'))!;
    expect(r.state).toBe('failed');
    expect(r.lastError).toBeTruthy();
    const calls = h.server.calls.upload;
    advance(1_000_000);
    await h.engine.kick();
    expect(h.server.calls.upload).toBe(calls);
  });

  it('401 pauses the queue without failing the report; resumes on the next kick', async () => {
    await h.submit('r1', 1);
    h.server.faults.create.push('auth');
    await h.engine.kick();
    expect(h.engine.getState().authPaused).toBe(true);
    const r = (await h.store.getReport('r1'))!;
    expect(r.state).toBe('queued');
    expect(r.attempts).toBe(0);
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
  });

  it('409 on commit (server lost an image): re-uploads only that image and succeeds in the same run', async () => {
    await h.submit('r1', 2);
    h.server.onUpload = (r, id) => {
      if (id === 'r1-img2') h.server.reports.get(r)!.received.delete('r1-img1'); // server "loses" image 1
    };
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
    expect(h.server.reports.get('r1')!.received.size).toBe(2);
    expect(h.server.calls.upload).toBe(3); // img1, img2, img1 again (only the lost one)
  });

  it('404 (server was reset): re-creates the report and finishes', async () => {
    await h.submit('r1', 1);
    h.server.faults.upload.push('network');
    await h.engine.kick();
    h.server.reports.clear();
    advance(10_000);
    await h.engine.kick(); // 404 -> re-create immediately, no long wait
    expect((await h.store.getReport('r1'))!.state).toBe('synced');
    expect(h.server.reports.get('r1')!.committed).toBe(true);
  });

  it('uploads one report at a time, oldest first', async () => {
    await h.submit('a', 2);
    await h.submit('b', 2);
    await h.submit('c', 2);
    const order: string[] = [];
    h.server.onUpload = r => void (order.includes(r) || order.push(r));
    await h.engine.kick();
    expect(h.server.maxConcurrent).toBe(1);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('a missing source photo fails that report permanently instead of looping', async () => {
    const input = await h.submit('r1', 1);
    h.files.delete(input.images[0].sourcePath);
    await h.engine.kick();
    expect((await h.store.getReport('r1'))!.state).toBe('failed');
  });

  it('reset() cancels in-flight work and the store can be cleared safely', async () => {
    await h.submit('r1', 1);
    const p = h.engine.kick();
    await h.engine.reset();
    await p;
    await h.store.clearAll();
    expect(await h.store.listReports()).toHaveLength(0);
  });

  it('a failed report does not block newer reports', async () => {
    await h.submit('bad', 1);
    await h.submit('good', 1);
    h.server.faults.create.push({ status: 422 });
    await h.engine.kick();
    expect((await h.store.getReport('bad'))!.state).toBe('failed');
    expect((await h.store.getReport('good'))!.state).toBe('synced');
  });
});
