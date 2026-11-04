import { SqlDb } from './sqlDb';

/** Append-only. Never edit an old entry: add a new one (PRAGMA user_version tracks how many ran). */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE reports (
       id TEXT PRIMARY KEY NOT NULL,
       description TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       state TEXT NOT NULL DEFAULT 'queued',
       remote_created INTEGER NOT NULL DEFAULT 0,
       attempts INTEGER NOT NULL DEFAULT 0,
       next_attempt_at INTEGER NOT NULL DEFAULT 0,
       last_error TEXT,
       synced_at INTEGER
     )`,
    `CREATE TABLE images (
       id TEXT PRIMARY KEY NOT NULL,
       report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
       position INTEGER NOT NULL,
       source_path TEXT,
       local_path TEXT,
       size_bytes INTEGER,
       state TEXT NOT NULL DEFAULT 'pending'
     )`,
    `CREATE INDEX idx_images_report ON images(report_id, position)`,
    `CREATE INDEX idx_reports_queue ON reports(state, next_attempt_at, created_at)`,
    `CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`,
  ],
];

export async function migrate(db: SqlDb): Promise<void> {
  const rows = await db.all<{ user_version: number }>('PRAGMA user_version');
  const current = rows[0]?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.transaction(async tx => {
      for (const stmt of MIGRATIONS[v]) await tx.run(stmt);
      await tx.run(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
