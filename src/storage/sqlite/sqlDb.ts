/** Tiny driver-agnostic SQL surface. Only opSqliteAdapter.ts knows which native library is used. */
export type SqlParam = string | number | null;
export interface SqlTx {
  run(sql: string, params?: SqlParam[]): Promise<void>;
  all<T = Record<string, any>>(sql: string, params?: SqlParam[]): Promise<T[]>;
}
export interface SqlDb extends SqlTx {
  /** All statements commit together or roll back together. */
  transaction(fn: (tx: SqlTx) => Promise<void>): Promise<void>;
}
