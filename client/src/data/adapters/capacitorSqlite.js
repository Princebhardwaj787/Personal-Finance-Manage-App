/**
 * CAPACITOR SQLITE ADAPTER (Android conversion — Phase C/E)
 * ========================================================
 * Implements the `Database` port on top of `@capacitor-community/sqlite`,
 * which uses the Android platform's own SQLite through a WebView bridge.
 *
 * IMPORTANT PLUGIN SEMANTICS (learned from the plugin's Android source)
 * ---------------------------------------------------------------------
 *  1. `createConnection` registers a connection IN MEMORY, per process. It
 *     does not create the file, and it throws "Connection ... already
 *     exists" if it is called twice. `open` then REQUIRES that connection to
 *     exist ("No available connection for database ...").
 *     => We must always register the connection, and tolerate the
 *        "already exists" error.
 *
 *  2. `run(statement, values)` with `transaction: true` COMMITS only when the
 *     statement returns a `lastId` (i.e. an INSERT). An UPDATE or DELETE
 *     would be ROLLED BACK in the plugin's `finally` block — silently losing
 *     the write.
 *     => Every statement is sent with `transaction: false` (autocommit), and
 *        real transactions are managed explicitly with
 *        begin/commit/rollbackTransaction.
 *
 *  3. DDL (CREATE TABLE, CREATE INDEX, ...) belongs in `execute`, not `run`.
 *
 *  4. Every plugin call is wrapped in a timeout: a financial app must never
 *     hang silently on the loading spinner.
 */

import { createDatabase } from '../db.js';

/** The on-device database name (without the `.db` suffix). */
export const DATABASE_NAME = 'finance';

/** How long a single plugin call may take before it is treated as failed. */
export const PLUGIN_TIMEOUT_MS = 15000;

let pluginPromise = null;

const getPlugin = async () => {
  if (!pluginPromise) {
    pluginPromise = import('@capacitor-community/sqlite')
      .then((mod) => {
        trace('plugin module loaded');
        const plugin = mod.CapacitorSQLite ?? mod.default;
        if (!plugin) {
          throw new Error('The Capacitor SQLite plugin is not available');
        }
        // IMPORTANT: the plugin object is a Proxy that returns a function for
        // EVERY property access, including `then`. Resolving a promise with
        // it would make the runtime treat it as a thenable and call
        // `CapacitorSQLite.then()`, which throws
        // "CapacitorSQLite.then() is not implemented on android".
        // It is therefore always returned WRAPPED in a plain object.
        return { plugin };
      })
      .catch((error) => {
        // Allow a later retry rather than caching a rejected promise.
        trace(`plugin module failed: ${error?.message ?? error}`);
        pluginPromise = null;
        throw error;
      });
  }
  // NOTE: the result is wrapped, never the bare proxy — see above.
  return pluginPromise;
};

/** Reject a plugin call that takes too long, so the UI can show an error. */
const withTimeout = (promise, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`The database did not respond to "${label}" in time`)),
        PLUGIN_TIMEOUT_MS
      )
    )
  ]);

/** Statements that must go through `execute` rather than `run`. */
const DDL_PATTERN = /^\s*(CREATE|ALTER|DROP|PRAGMA|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|REPLACE\s+INTO)\b/i;

const isDdl = (sql) => DDL_PATTERN.test(String(sql ?? ''));

/**
 * A short, explicit trace of the start-up sequence.
 *
 * It contains no financial data — only the shape of the process — and it is
 * the first thing to look at when the app hangs on the loading screen on a
 * real device.
 */
const trace = (message) => {
  if (typeof console !== 'undefined') console.log(`[finance:db] ${message}`);
};

export const openCapacitorDatabase = async (options = {}) => {
  trace('loading the plugin module');
  const { plugin } = await getPlugin();
  const { encrypted = false, encryptionKey } = options;

  // 1. Register the connection for this process. The plugin keeps it in
  //    memory, so it must be registered on EVERY start, even when the
  //    database file already exists from a previous run.
  trace('registering the connection');
  try {
    await withTimeout(
      plugin.createConnection({
        database: DATABASE_NAME,
        encrypted,
        mode: encrypted ? 'secret' : 'no-encryption',
        version: 1
      }),
      'createConnection'
    );
    trace('connection registered');
  } catch (error) {
    // "Connection finance already exists" just means this process already
    // registered it — that is fine.
    if (!/already exists/i.test(String(error?.message ?? ''))) {
      throw error;
    }
    trace('connection was already registered');
  }

  // 2. Open the database.
  trace('opening the database');
  await withTimeout(
    plugin.open({
      database: DATABASE_NAME,
      readonly: false,
      encryptionKey: encrypted ? encryptionKey : undefined
    }),
    'open'
  );
  trace('database opened');

  /** Run one statement. `transaction: false` keeps the plugin from rolling
   *  our own transactions back. */
  const runStatement = async (sql, params = []) => {
    if (isDdl(sql)) {
      const result = await withTimeout(
        plugin.execute({
          database: DATABASE_NAME,
          statements: String(sql),
          transaction: false,
          readonly: false
        }),
        'execute'
      );
      return { rowsAffected: Number(result?.changes?.changes ?? 0) };
    }

    const result = await withTimeout(
      plugin.run({
        database: DATABASE_NAME,
        statement: String(sql),
        values: params,
        transaction: false,
        readonly: false
      }),
      'run'
    );
    return { rowsAffected: Number(result?.changes?.changes ?? 0) };
  };

  const adapter = {
    async execute(sql, params = []) {
      return runStatement(sql, params);
    },

    async select(sql, params = []) {
      const result = await withTimeout(
        plugin.query({
          database: DATABASE_NAME,
          statement: String(sql),
          values: params,
          readonly: false
        }),
        'query'
      );
      return result?.values ?? [];
    },

    /**
     * A real transaction. The plugin's own per-statement transaction handling
     * is disabled (see note 2 above), so the commit/rollback is entirely
     * ours — a failed operation really does leave the database untouched.
     */
    async transaction(fn) {
      await withTimeout(
        plugin.beginTransaction({ database: DATABASE_NAME }),
        'beginTransaction'
      );

      const tx = {
        execute: (sql, params = []) => runStatement(sql, params),
        select: async (sql, params = []) => {
          const result = await withTimeout(
            plugin.query({
              database: DATABASE_NAME,
              statement: String(sql),
              values: params,
              readonly: false
            }),
            'query'
          );
          return result?.values ?? [];
        }
      };

      try {
        const result = await fn(tx);
        await withTimeout(
          plugin.commitTransaction({ database: DATABASE_NAME }),
          'commitTransaction'
        );
        return result;
      } catch (error) {
        try {
          await withTimeout(
            plugin.rollbackTransaction({ database: DATABASE_NAME }),
            'rollbackTransaction'
          );
        } catch {
          // A rollback failure must not mask the original error.
        }
        throw error;
      }
    },

    raw: { plugin, database: DATABASE_NAME }
  };

  const db = createDatabase(adapter);

  return {
    ...db,
    /** Run a batch of DDL statements in one call. */
    async executeBatch(statements) {
      await withTimeout(
        plugin.execute({
          database: DATABASE_NAME,
          // The plugin splits a batch on ";\n", so the statements must be
          // separated that way.
          statements: statements.map((s) => `${s.replace(/;\s*$/, '')};`).join('\n'),
          transaction: false,
          readonly: false
        }),
        'executeBatch'
      );
    },
    close: () => plugin.close({ database: DATABASE_NAME }),
    raw: { plugin, database: DATABASE_NAME }
  };
};

export default openCapacitorDatabase;
