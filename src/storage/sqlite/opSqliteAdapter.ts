import { open } from '@op-engineering/op-sqlite';
import { SqlDb, SqlParam, SqlTx } from './sqlDb';

/**
 * The ONLY file that imports the native SQLite library.
 * Written against @op-engineering/op-sqlite (open / execute / transaction). If you swap the driver,
 * implement SqlDb here and nothing else changes.
 */
const rowsOf = (res: any): any[] => (Array.isArray(res?.rows) ? res.rows : res?.rows?._array ?? []);

export function openDatabase(name = 'fieldreports.db'): SqlDb {
  const db: any = open({ name });
  const make = (exec: any): SqlTx => ({
    async run(sql: string, params: SqlParam[] = []) {
      await exec.execute(sql, params);
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return rowsOf(await exec.execute(sql, params)) as T[];
    },
  });
  return {
    ...make(db),
    async transaction(fn) {
      await db.transaction(async (tx: any) => {
        await fn(make(tx));
      });
    },
  };
}
