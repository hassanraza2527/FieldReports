/** Runs the REAL SQL + migrations against Node's built-in SQLite (same engine as on the phone). */
declare const require: any;
let DatabaseSync: any = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync; // needs Node >= 22.5, otherwise this suite is skipped
} catch {
  DatabaseSync = null;
}
import { migrate } from '../storage/sqlite/migrations';
import { SqlDb, SqlParam, SqlTx } from '../storage/sqlite/sqlDb';
import { SqliteReportStore } from '../storage/sqlite/SqliteReportStore';

function nodeDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const tx: SqlTx = {
    async run(sql: string, p: SqlParam[] = []) {
      db.prepare(sql).run(...p);
    },
    async all<T>(sql: string, p: SqlParam[] = []) {
      return db.prepare(sql).all(...p) as unknown as T[];
    },
  };
  return {
    ...tx,
    async transaction(fn) {
      db.exec('BEGIN');
      try {
        await fn(tx);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

async function fresh() {
  const db = nodeDb();
  await migrate(db);
  return { db, store: new SqliteReportStore(db) };
}
const input = (id: string, n = 2, at = 1) => ({
  id, description: 'Cracked pipe', createdAt: at,
  images: Array.from({ length: n }, (_, i) => ({ id: `${id}-i${i}`, sourcePath: `/s/${id}-${i}.jpg` })),
});

(DatabaseSync ? describe : describe.skip)('SqliteReportStore (real SQLite)', () => {
  it('migrations are idempotent', async () => {
    const { db } = await fresh();
    await migrate(db);
    expect((await db.all<any>('PRAGMA user_version'))[0].user_version).toBe(1);
  });
  it('createReport writes report + all images atomically', async () => {
    const { store } = await fresh();
    await store.createReport(input('r1', 3));
    const r = (await store.getReport('r1'))!;
    expect(r.state).toBe('queued');
    expect(r.images.map(i => i.position)).toEqual([0, 1, 2]);
    expect(r.images.every(i => i.state === 'pending')).toBe(true);
  });
  it('rolls back everything if one image row fails (no half-saved report)', async () => {
    const { store } = await fresh();
    const bad = input('r1', 2);
    bad.images[1].id = bad.images[0].id; // duplicate PK -> second insert fails
    await expect(store.createReport(bad)).rejects.toBeTruthy();
    expect(await store.getReport('r1')).toBeNull();
    expect(await store.listReports()).toHaveLength(0);
  });
  it('patches round-trip incl. booleans, and queue ordering honours nextAttemptAt', async () => {
    const { store } = await fresh();
    await store.createReport(input('a', 1, 1));
    await store.createReport(input('b', 1, 2));
    await store.patchReport('a', { remoteCreated: true, attempts: 2, nextAttemptAt: 500, lastError: 'x' });
    await store.patchImage('a-i0', { state: 'ready', localPath: '/c/a.jpg', sizeBytes: 123 });
    const a = (await store.getReport('a'))!;
    expect(a.remoteCreated).toBe(true);
    expect(a.images[0]).toMatchObject({ state: 'ready', localPath: '/c/a.jpg', sizeBytes: 123 });
    expect((await store.nextRunnable(100))!.id).toBe('b'); // a is backing off
    expect((await store.nextRunnable(1000))!.id).toBe('a'); // oldest first
    expect(await store.nextWakeAt()).toBe(0);
  });
  it('data survives a restart (same DB, new store instance)', async () => {
    const { db, store } = await fresh();
    await store.createReport(input('r1'));
    expect((await new SqliteReportStore(db).listReports())).toHaveLength(1);
  });
  it('pruneSynced only removes synced rows; clearAll keeps the device account (meta)', async () => {
    const { store } = await fresh();
    await store.setMeta('auth.token', 'T');
    await store.createReport(input('a'));
    await store.createReport(input('b'));
    await store.patchReport('a', { state: 'synced' });
    await store.pruneSynced(['a', 'b']);
    expect((await store.listReports()).map(r => r.id)).toEqual(['b']);
    await store.clearAll();
    expect(await store.listReports()).toHaveLength(0);
    expect(await store.getMeta('auth.token')).toBe('T');
    await store.setMeta('auth.token', 'T2');
    expect(await store.getMeta('auth.token')).toBe('T2');
  });
});
