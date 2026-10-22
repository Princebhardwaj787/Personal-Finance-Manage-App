/**
 * BACKUP FORMAT, VALIDATION AND RESTORE (Android conversion — Phase F)
 * =====================================================================
 * A versioned JSON backup of everything the app knows about, plus a safe,
 * explicit restore workflow.
 *
 * FORMAT
 * ------
 * {
 *   "format":         "finance-manager-backup",
 *   "formatVersion":  1,
 *   "appVersion":     "1.0.0",
 *   "schemaVersion":  1,
 *   "exportedAt":     "2026-10-21T19:00:00.000Z",
 *   "counts":         { "transactions": 5, ... },
 *   "data":           { "accounts": [...], "transactions": [...], ... }
 * }
 *
 * Money is stored in INTEGER MINOR UNITS in the backup, exactly as it is in
 * the database, so a backup round-trips without any floating-point drift.
 *
 * RESTORE SAFETY
 * --------------
 * 1. The file is validated BEFORE anything is written (format, version,
 *    required fields, types, row shape).
 * 2. The caller gets a PREVIEW (counts + date range) and must confirm.
 * 3. A safety copy of the current data is taken first, so a restore can be
 *    undone.
 * 4. The import runs inside ONE database transaction: either everything is
 *    applied or nothing is.
 * 5. After the import the data is verified (counts and balances).
 */

import { AppError } from '@shared/AppError.js';
import { fromMinorUnits } from '@shared/money.js';
import { makeId } from './schema.js';

export const BACKUP_FORMAT = 'finance-manager-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const SCHEMA_VERSION = 1;

/** The entities a backup carries, in the order they must be restored. */
export const BACKUP_ENTITIES = [
  'accounts',
  'categories',
  'transactions',
  'transfers',
  'budgets',
  'savingsGoals',
  'savingsContributions',
  'recurringExpenses',
  'recurringOccurrences',
  'reportHistory',
  'notifications',
  'notificationPreferences',
  'settings'
];

/** Rows in a backup keep their original ids so a restore is exact. */
const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/**
 * Build a backup object from the local database.
 *
 * @param {import('./db.js').Database} db
 * @param {object} [options]
 * @param {string} [options.appVersion]
 * @param {string} [options.userId]
 */
export const createBackup = async (db, { appVersion = '1.0.0', userId = null } = {}) => {
  const data = {};

  for (const entity of BACKUP_ENTITIES) {
    if (entity === 'settings') {
      data.settings = await db.select('SELECT key, value FROM "AppSetting"');
      continue;
    }

    const table = {
      accounts: 'Account',
      categories: 'Category',
      transactions: 'Transaction',
      transfers: 'Transfer',
      budgets: 'Budget',
      savingsGoals: 'SavingsGoal',
      savingsContributions: 'SavingsContribution',
      recurringExpenses: 'RecurringExpense',
      recurringOccurrences: 'RecurringOccurrence',
      reportHistory: 'ReportHistory',
      notifications: 'Notification',
      notificationPreferences: 'NotificationPreference'
    }[entity];

    const rows = await db.select(`SELECT * FROM "${table}"`);
    // Everything belongs to the one local user, but keep the column so a
    // future multi-user backup still restores correctly.
    data[entity] = userId ? rows.map((row) => ({ ...row, userId: row.userId ?? userId })) : rows;
  }

  const counts = Object.fromEntries(
    Object.entries(data).map(([entity, rows]) => [entity, Array.isArray(rows) ? rows.length : 0])
  );

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    counts,
    data
  };
};

/** Serialise a backup to the JSON text that is written to the file. */
export const serializeBackup = (backup) => JSON.stringify(backup, null, 2);

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Validate a parsed backup object.
 *
 * @returns {{ valid: boolean, errors: string[], warnings: string[], summary: object }}
 */
export const validateBackup = (backup) => {
  const errors = [];
  const warnings = [];

  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return {
      valid: false,
      errors: ['The file is not a backup object.'],
      warnings,
      summary: null
    };
  }

  if (backup.format !== BACKUP_FORMAT) {
    errors.push(
      `Unexpected file format "${backup.format ?? 'missing'}". Expected "${BACKUP_FORMAT}".`
    );
  }

  const version = Number(backup.formatVersion);
  if (!Number.isInteger(version) || version < 1) {
    errors.push('The backup does not declare a valid formatVersion.');
  } else if (version > BACKUP_FORMAT_VERSION) {
    errors.push(
      `This backup was created by a newer version of the app (format ${version}). ` +
        'Update the app before restoring it.'
    );
  }

  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    errors.push('The backup has no "data" section.');
    return { valid: false, errors, warnings, summary: null };
  }

  for (const entity of BACKUP_ENTITIES) {
    const rows = backup.data[entity];
    if (rows === undefined) {
      warnings.push(`The backup does not contain "${entity}".`);
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`"${entity}" must be an array.`);
      continue;
    }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        errors.push(`"${entity}" contains a row that is not an object.`);
        break;
      }
      if (entity !== 'settings' && !row.id) {
        errors.push(`"${entity}" contains a row without an id.`);
        break;
      }
    }
  }

  // Money integrity: every monetary value must be a whole number of minor
  // units. A float here would mean the backup came from a broken exporter.
  const moneyChecks = [
    ['accounts', 'balance'],
    ['transactions', 'amount'],
    ['transfers', 'amount'],
    ['budgets', 'amount'],
    ['savingsGoals', 'targetAmount'],
    ['savingsGoals', 'currentAmount'],
    ['savingsContributions', 'amount'],
    ['recurringExpenses', 'amount']
  ];
  for (const [entity, field] of moneyChecks) {
    const rows = backup.data[entity];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row[field] === undefined || row[field] === null) continue;
      if (!Number.isInteger(row[field])) {
        errors.push(
          `"${entity}.${field}" must be an integer number of minor units (paise). ` +
            'The file may be corrupt or was produced by an incompatible exporter.'
        );
        break;
      }
    }
  }

  const summary = buildSummary(backup);

  return { valid: errors.length === 0, errors, warnings, summary };
};

/** A human-readable summary of what a backup contains. */
export const buildSummary = (backup) => {
  if (!backup?.data || typeof backup.data !== 'object') return null;

  const counts = {};
  for (const entity of BACKUP_ENTITIES) {
    const rows = backup.data[entity];
    counts[entity] = Array.isArray(rows) ? rows.length : 0;
  }

  const transactions = Array.isArray(backup.data.transactions) ? backup.data.transactions : [];
  const dates = transactions
    .map((row) => (row.date ? String(row.date).slice(0, 10) : null))
    .filter(Boolean)
    .sort();

  // Be defensive: a malformed backup must produce a summary (and a list of
  // errors), never an exception.
  const accounts = Array.isArray(backup.data.accounts) ? backup.data.accounts : [];
  const totalBalance = accounts.reduce(
    (sum, account) => sum + (Number(account?.balance) || 0),
    0
  );

  return {
    counts,
    exportedAt: backup.exportedAt ?? null,
    appVersion: backup.appVersion ?? null,
    formatVersion: backup.formatVersion ?? null,
    earliestTransaction: dates[0] ?? null,
    latestTransaction: dates[dates.length - 1] ?? null,
    totalBalanceMinor: totalBalance,
    totalBalance: fromMinorUnits(totalBalance)
  };
};

/**
 * Parse and validate a backup file.
 *
 * @param {string} text the file contents
 * @returns {{ valid: boolean, errors: string[], warnings: string[], backup: object|null, summary: object|null }}
 */
export const parseBackup = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      valid: false,
      errors: [`The file is not valid JSON: ${error.message}`],
      warnings: [],
      backup: null,
      summary: null
    };
  }

  const result = validateBackup(parsed);
  return { ...result, backup: result.valid ? parsed : null };
};

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

/** Table name for each backup entity. */
const TABLES = {
  accounts: 'Account',
  categories: 'Category',
  transactions: 'Transaction',
  transfers: 'Transfer',
  budgets: 'Budget',
  savingsGoals: 'SavingsGoal',
  savingsContributions: 'SavingsContribution',
  recurringExpenses: 'RecurringExpense',
  recurringOccurrences: 'RecurringOccurrence',
  reportHistory: 'ReportHistory',
  notifications: 'Notification',
  notificationPreferences: 'NotificationPreference'
};

/**
 * Restore a validated backup.
 *
 * `mode`:
 *   - `'replace'` — the current data is deleted and the backup takes its
 *     place. This is the default because a partial merge of financial
 *     records produces a history nobody can reconcile.
 *   - `'merge'`  — rows are inserted only when their id does not exist yet.
 *     Existing rows are never modified.
 *
 * The whole import runs in ONE transaction.
 *
 * @param {import('./db.js').Database} db
 * @param {object} backup a validated backup object
 * @param {object} [options]
 * @param {'replace'|'merge'} [options.mode]
 * @param {string} [options.userId] the local user the rows belong to
 * @returns {Promise<{ mode: string, imported: object, verified: boolean }>}
 */
export const restoreBackup = async (db, backup, { mode = 'replace', userId = null } = {}) => {
  if (!backup?.data) throw new AppError('There is nothing to restore', 400);

  const imported = {};

  await db.transaction(async (tx) => {
    if (mode === 'replace') {
      // Delete in reverse dependency order so the foreign keys stay happy.
      const order = [
        'RecurringOccurrence',
        'Transaction',
        'Transfer',
        'SavingsContribution',
        'SavingsGoal',
        'Budget',
        'RecurringExpense',
        'Notification',
        'NotificationPreference',
        'ReportHistory',
        'Category',
        'Account',
        'AppSetting'
      ];
      for (const table of order) {
        await tx.execute(`DELETE FROM "${table}"`);
      }
    }

    for (const entity of BACKUP_ENTITIES) {
      const rows = backup.data[entity];
      if (!Array.isArray(rows) || rows.length === 0) {
        imported[entity] = 0;
        continue;
      }

      if (entity === 'settings') {
        let count = 0;
        for (const row of rows) {
          if (!row?.key) continue;
          await tx.execute(
            'INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES (?, ?, ?) ' +
              'ON CONFLICT(key) DO UPDATE SET value = excluded.value, "updatedAt" = excluded."updatedAt"',
            [row.key, row.value ?? null, now()]
          );
          count += 1;
        }
        imported[entity] = count;
        continue;
      }

      const table = TABLES[entity];
      const columns = await tx.select(`PRAGMA table_info("${table}")`);
      const columnNames = columns.map((c) => c.name);
      let count = 0;

      for (const row of rows) {
        const keys = columnNames.filter((name) => row[name] !== undefined);
        if (keys.length === 0) continue;

        const values = keys.map((name) => {
          const value = row[name];
          if (name === 'userId' && (value === null || value === undefined) && userId) return userId;
          return value;
        });

        if (mode === 'merge') {
          // Only insert when the id is not already present.
          const existing = await tx.select(`SELECT id FROM "${table}" WHERE id = ?`, [row.id]);
          if (existing.length > 0) continue;
        }

        const placeholders = keys.map(() => '?').join(',');
        await tx.execute(
          `INSERT INTO "${table}" (${keys.map((name) => `"${name}"`).join(',')}) VALUES (${placeholders})`,
          values
        );
        count += 1;
      }

      imported[entity] = count;
    }
  });

  // Verify the restore actually landed.
  const verification = await verifyRestore(db, backup);

  return { mode, imported, verified: verification.ok, verification };
};

/**
 * Compare the restored data with the backup.
 *
 * @returns {{ ok: boolean, problems: string[] }}
 */
export const verifyRestore = async (db, backup) => {
  const problems = [];

  for (const entity of BACKUP_ENTITIES) {
    if (entity === 'settings') continue;
    const rows = backup.data[entity];
    if (!Array.isArray(rows)) continue;

    const table = TABLES[entity];
    const stored = await db.select(`SELECT COUNT(*) AS c FROM "${table}"`);
    const count = Number(stored[0]?.c ?? 0);

    if (count < rows.length) {
      problems.push(`"${entity}" has ${count} rows but the backup had ${rows.length}.`);
    }
  }

  // Balances must be exactly what the backup recorded. The stored balance is
  // an opening balance plus the net movement, so it cannot be recomputed from
  // the transactions alone — but it CAN be compared with the backup, which is
  // what "the restore is exact" means.
  const backupAccounts = Array.isArray(backup.data.accounts) ? backup.data.accounts : [];
  for (const account of backupAccounts) {
    const rows = await db.select('SELECT balance FROM "Account" WHERE id = ?', [account.id]);
    if (rows.length === 0) {
      problems.push(`Account ${account.id} is missing after the restore.`);
      continue;
    }
    const stored = Number(rows[0].balance);
    const expected = Number(account.balance);
    if (!Number.isFinite(stored)) {
      problems.push(`Account ${account.id} has a non-numeric balance.`);
    } else if (stored !== expected) {
      problems.push(
        `Account ${account.id} has balance ${stored} but the backup had ${expected}.`
      );
    }
  }

  // Every transaction must carry exactly the amount the backup recorded.
  const backupTransactions = Array.isArray(backup.data.transactions)
    ? backup.data.transactions
    : [];
  for (const transaction of backupTransactions) {
    const rows = await db.select('SELECT amount FROM "Transaction" WHERE id = ?', [transaction.id]);
    if (rows.length === 0) {
      problems.push(`Transaction ${transaction.id} is missing after the restore.`);
      continue;
    }
    if (Number(rows[0].amount) !== Number(transaction.amount)) {
      problems.push(
        `Transaction ${transaction.id} has amount ${rows[0].amount} but the backup had ${transaction.amount}.`
      );
    }
  }

  return { ok: problems.length === 0, problems };
};

/**
 * Take a safety copy of the current data before a destructive restore.
 *
 * @returns {Promise<object>} the backup object that was taken
 */
export const createSafetyBackup = async (db, options = {}) =>
  createBackup(db, { appVersion: 'safety-snapshot', ...options });

/** A filename for a backup, safe on every filesystem. */
export const backupFilename = (prefix = 'finance-backup') => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}-${stamp}.json`;
};

/** A short, human summary of a restore result. */
export const describeRestore = (result) => {
  const parts = [];
  for (const [entity, count] of Object.entries(result.imported ?? {})) {
    if (count > 0) parts.push(`${count} ${entity}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing';
};

export { makeId };
