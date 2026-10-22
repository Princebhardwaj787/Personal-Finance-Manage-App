/**
 * DATABASE PORT (Android conversion — Phase C)
 * ============================================
 * A tiny, adapter-agnostic interface over SQLite.
 *
 * The whole point of this port is that the SAME repository SQL and the SAME
 * service logic run in three places:
 *
 *   - the Android device   -> `adapters/capacitorSqlite.js`
 *   - the Node test suite  -> `adapters/nodeSqlite.js`   (node:sqlite, no deps)
 *   - a desktop browser    -> `adapters/capacitorSqlite.js` (web/WASM build)
 *
 * Only `?`-style positional parameters are used, because that is what both
 * SQLite implementations understand.
 *
 * The port is intentionally tiny. Anything richer (an ORM, a query builder)
 * would tie the repositories to one implementation and defeat the purpose.
 *
 * @typedef {{ execute(sql: string, params?: any[]): Promise<{rowsAffected:number}> }} SqlExecutor
 * @typedef {{ select(sql: string, params?: any[]): Promise<any[]> }} SqlSelector
 */

/**
 * @typedef {object} Database
 * @property {SqlExecutor} execute   run a statement that changes data
 * @property {SqlSelector} select    run a statement that reads rows
 * @property {(fn: (tx: Database) => Promise<any>) => Promise<any>} transaction
 */

/** Normalise whatever the adapter returned into `{ rowsAffected }`. */
const normaliseExecuteResult = (result) => {
  if (result && typeof result === 'object' && 'rowsAffected' in result) {
    return { rowsAffected: Number(result.rowsAffected) || 0 };
  }
  if (result && typeof result === 'object' && 'changes' in result) {
    return { rowsAffected: Number(result.changes) || 0 };
  }
  return { rowsAffected: 0 };
};

/** Normalise whatever the adapter returned into a plain array of rows. */
const normaliseRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && result.rows && Array.isArray(result.rows.items)) return result.rows.items;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
};

/**
 * Normalise bound parameters.
 *
 * SQLite has no boolean type and no date type, and the two driver
 * implementations differ on what they accept:
 *   - `node:sqlite` refuses to bind a JS boolean ("Provided value cannot be
 *     bound to SQLite parameter N").
 *   - `Date` objects are not portable between drivers.
 *
 * Converting here means the repositories can pass natural JavaScript values
 * and both adapters receive exactly what SQLite understands.
 */
export const normaliseParams = (params = []) =>
  params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    if (value === undefined) return null;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Plain objects are not bindable — fail loudly rather than silently
      // writing "[object Object]" into a financial column.
      throw new TypeError('Cannot bind a plain object as a SQL parameter');
    }
    return value;
  });

/**
 * Wrap a raw adapter into the `Database` port.
 *
 * @param {object} adapter
 * @param {(sql:string, params?:any[]) => Promise<any>} adapter.execute
 * @param {(sql:string, params?:any[]) => Promise<any>} adapter.select
 * @param {(fn:(tx:any)=>Promise<any>) => Promise<any>} [adapter.transaction]
 */
export const createDatabase = (adapter) => {
  const db = {
    async execute(sql, params = []) {
      const result = await adapter.execute(sql, normaliseParams(params));
      return normaliseExecuteResult(result);
    },

    async select(sql, params = []) {
      const result = await adapter.select(sql, normaliseParams(params));
      return normaliseRows(result);
    },

    /**
     * Run `fn` inside a database transaction.
     *
     * The callback receives a `tx` object with the same `execute`/`select`
     * shape, so repositories never need to know whether they are running
     * inside a transaction or not.
     */
    async transaction(fn) {
      if (typeof adapter.transaction === 'function') {
        return adapter.transaction(async (tx) =>
          fn({
            execute: async (sql, params = []) =>
              normaliseExecuteResult(await tx.execute(sql, normaliseParams(params))),
            select: async (sql, params = []) =>
              normaliseRows(await tx.select(sql, normaliseParams(params))),
            executeBatch:
              typeof tx.executeBatch === 'function'
                ? (statements) => tx.executeBatch(statements)
                : null
          })
        );
      }

      // Adapters without native transaction support fall back to a
      // best-effort sequential run. The SQLite adapter used on device
      // always provides real transactions.
      return fn(db);
    },

    /** Escape hatch for adapter-specific features (e.g. file export). */
    raw: adapter.raw ?? null,

    /**
     * Run several DDL statements in ONE round trip, when the adapter
     * supports it. Creating the schema is ~50 statements; on the device
     * each native call has real latency, so batching matters.
     */
    executeBatch:
      typeof adapter.executeBatch === 'function'
        ? async (statements) => adapter.executeBatch(statements)
        : null
  };

  return db;
};

export default createDatabase;
