/**
 * NODE SQLITE ADAPTER (Android conversion — Phase C)
 * ==================================================
 * Implements the `Database` port on top of Node's built-in `node:sqlite`
 * module (Node 22.5+, stable enough for our use and available with no
 * dependency at all).
 *
 * Why this exists:
 *   It lets the automated test suite exercise the EXACT repository SQL and
 *   service logic that run on the device, against a real SQLite database —
 *   no emulator, no device, no extra npm dependency.
 *
 * It is a test/dev adapter. It is never bundled into the Android app.
 */

import { createRequire } from 'node:module';
import { createDatabase } from '../db.js';

/**
 * `node:sqlite` is loaded through `createRequire` rather than a static
 * `import`.
 *
 * Vite's list of known Node builtins does not include `node:sqlite` (it
 * was added in Node 22.5), so a static import makes the bundler try to
 * resolve a browser module named "sqlite" and fail. `createRequire` asks
 * Node directly, which always works — and it also guarantees this adapter
 * is never pulled into a browser bundle.
 */
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

/**
 * Open (or create) a SQLite database file with the given pragmas.
 *
 * @param {string} filename path, or ':memory:'
 */
export const openNodeDatabase = (filename = ':memory:') => {
  const raw = new DatabaseSync(filename);

  // Pragmas that matter for a financial database:
  //  - foreign_keys ON  : referential integrity is enforced
  //  - journal WAL     : concurrent readers while a write is in progress
  //  - busy_timeout    : wait instead of failing when the file is locked
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');
  if (filename !== ':memory:') {
    raw.exec('PRAGMA journal_mode = WAL');
  }

  const adapter = {
    execute(sql, params = []) {
      const statement = raw.prepare(sql);
      const result = statement.run(...params);
      return { rowsAffected: Number(result.changes) || 0 };
    },

    select(sql, params = []) {
      const statement = raw.prepare(sql);
      return statement.all(...params);
    },

    /**
     * Real transaction support. `BEGIN`/`COMMIT`/`ROLLBACK` are issued
     * directly so the callback sees a consistent view.
     */
    async transaction(fn) {
      raw.exec('BEGIN');
      try {
        const result = await fn({
          execute: (sql, params = []) => {
            const statement = raw.prepare(sql);
            const r = statement.run(...params);
            return { rowsAffected: Number(r.changes) || 0 };
          },
          select: (sql, params = []) => raw.prepare(sql).all(...params),
          // The Node adapter has no native round trip, so a batch is just a
          // loop — but it keeps the same shape as the device adapter.
          executeBatch: async (statements) => {
            for (const statement of statements) raw.exec(statement);
          }
        });
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          raw.exec('ROLLBACK');
        } catch {
          // A rollback failure must not mask the original error.
        }
        throw error;
      }
    },

    raw
  };

  const db = createDatabase(adapter);

  return {
    ...db,
    /** Direct access for tests (PRAGMA checks, file handling). */
    handle: raw,
    close: () => raw.close()
  };
};

export default openNodeDatabase;
