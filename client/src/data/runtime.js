/**
 * LOCAL DATA RUNTIME (Android conversion — Phase C)
 * ================================================
 * Boots the on-device database and exposes the data store to the API layer.
 *
 * In the WEB build this module does nothing: the app talks to the Express
 * API exactly as before. In the ANDROID build it opens the local SQLite
 * database, applies the schema migrations and seeds the default categories.
 *
 * The store is exposed through a promise so the API adapters can simply
 * `await getStore()` and never have to know whether the app is still
 * starting up.
 */

import { createDataStore } from './store.js';
import { bootstrap, LOCAL_USER_ID } from './schema.js';
import { isNativeBuild } from '../services/platform.js';

let storePromise = null;
let initialisationError = null;

/** The single local user that owns every record on the device. */
export const LOCAL_USER = LOCAL_USER_ID;

/**
 * Open the device database, apply migrations and build the store.
 *
 * @param {object} [options]
 * @param {boolean} [options.encrypted] enable SQLCipher encryption
 * @param {string}  [options.encryptionKey]
 */
const initialise = async (options = {}) => {
  // A short, explicit trace of the start-up sequence. It contains no
  // financial data — only the shape of the process.
  const trace = (message) => {
    if (typeof console !== 'undefined') console.log(`[finance] ${message}`);
  };

  trace('opening the local database');
  const { openCapacitorDatabase } = await import('./adapters/capacitorSqlite.js');

  const db = await openCapacitorDatabase(options);
  trace('database opened');

  // The plugin runs DDL through `execute`; the schema migration uses the
  // port's `execute`, which maps to a single statement per call. That works,
  // but a batch is faster and atomic on device.
  const migration = await bootstrap(db);
  trace(`schema at version ${migration.version}`);

  const store = createDataStore(db);
  trace('data store ready');

  return { db, store, migration };
};

/**
 * Get the local data store. Resolves once the database is ready.
 * In the web build it rejects with a clear error, because the web build
 * must use the HTTP API instead.
 */
export const getStore = async () => {
  if (!isNativeBuild()) {
    throw new Error('The local data store is only available in the native build');
  }
  if (!storePromise) {
    storePromise = initialise().catch((error) => {
      // Allow a later retry rather than caching a rejected promise.
      storePromise = null;
      initialisationError = error;
      throw error;
    });
  }
  return storePromise;
};

/** Start the local database. Safe to call more than once. */
export const initLocalData = async () => {
  if (!isNativeBuild()) return null;
  return getStore();
};

/** The error thrown by the last initialisation attempt, if any. */
export const getInitialisationError = () => initialisationError;

/** Close the database (used when the app is torn down in tests). */
export const closeLocalData = async () => {
  if (!storePromise) return;
  try {
    const { db } = await storePromise;
    await db.close?.();
  } catch {
    // Closing is best-effort.
  }
  storePromise = null;
};

export default getStore;
