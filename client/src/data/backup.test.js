/**
 * BACKUP / RESTORE TESTS (Android conversion — Phase F)
 * ====================================================
 * The backup format is the ONLY way financial records leave the device, so
 * it has to be exactly right — and a broken file must never be able to
 * damage the existing data.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { openNodeDatabase } from './adapters/nodeSqlite.js';
import { bootstrap, LOCAL_USER_ID } from './schema.js';
import { createAccountService } from './services/accountService.js';
import { createTransactionService } from './services/transactionService.js';
import {
  createBackup,
  serializeBackup,
  parseBackup,
  validateBackup,
  restoreBackup,
  verifyRestore,
  createSafetyBackup,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION
} from './backup.js';

let db;
let accounts;
let transactions;

beforeEach(async () => {
  db = openNodeDatabase(':memory:');
  await bootstrap(db);
  accounts = createAccountService(db);
  transactions = createTransactionService(db);
});

afterAll(() => {
  db?.close?.();
});

/** Populate the database with a small, realistic data set. */
const seedData = async () => {
  const cash = await accounts.createAccount(LOCAL_USER_ID, {
    name: 'Cash', type: 'CASH', balance: 1000, currency: 'INR'
  });
  const bank = await accounts.createAccount(LOCAL_USER_ID, {
    name: 'Bank', type: 'BANK', balance: 500, currency: 'INR'
  });
  await transactions.createTransaction(LOCAL_USER_ID, {
    type: 'INCOME', amount: 250.50, accountId: cash.id, description: 'Salary'
  });
  await transactions.createTransaction(LOCAL_USER_ID, {
    type: 'EXPENSE', amount: 75.25, accountId: bank.id, description: 'Bills'
  });
  return { cash, bank };
};

describe('backup export', () => {
  it('produces a versioned backup with counts', async () => {
    await seedData();
    const backup = await createBackup(db, { appVersion: '1.0.0' });

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.appVersion).toBe('1.0.0');
    expect(backup.exportedAt).toBeTruthy();
    expect(backup.counts.accounts).toBe(2);
    expect(backup.counts.transactions).toBe(2);
  });

  it('stores money as integer minor units so it round-trips exactly', async () => {
    await seedData();
    const backup = await createBackup(db);

    const txn = backup.data.transactions.find((t) => t.description === 'Salary');
    expect(txn.amount).toBe(25050);
    expect(Number.isInteger(txn.amount)).toBe(true);

    const account = backup.data.accounts.find((a) => a.name === 'Cash');
    expect(account.balance).toBe(125050); // 1000.00 opening + 250.50 income
  });

  it('serialises to JSON that parses back to an equal object', async () => {
    await seedData();
    const backup = await createBackup(db);
    const text = serializeBackup(backup);
    expect(JSON.parse(text)).toEqual(backup);
  });
});

describe('backup validation', () => {
  it('accepts a backup it produced', async () => {
    await seedData();
    const backup = await createBackup(db);
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.counts.transactions).toBe(2);
  });

  it('rejects a file that is not JSON', () => {
    const result = parseBackup('this is not json');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/not valid JSON/);
  });

  it('rejects a JSON file with the wrong format marker', async () => {
    const backup = await createBackup(db);
    const result = parseBackup(JSON.stringify({ ...backup, format: 'something-else' }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Unexpected file format/);
  });

  it('rejects a backup from a newer format version', async () => {
    const backup = await createBackup(db);
    const result = parseBackup(
      JSON.stringify({ ...backup, formatVersion: BACKUP_FORMAT_VERSION + 1 })
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/newer version/);
  });

  it('rejects a backup with no data section', () => {
    const result = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 1 }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/no "data" section/);
  });

  it('rejects non-integer monetary values (a corrupt or float exporter)', async () => {
    await seedData();
    const backup = await createBackup(db);
    backup.data.transactions[0].amount = 250.5; // a float, not minor units
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/integer number of minor units/);
  });

  it('rejects an entity that is not an array', async () => {
    await seedData();
    const backup = await createBackup(db);
    backup.data.accounts = 'nope';
    const result = validateBackup(backup);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/"accounts" must be an array/);
  });

  it('warns about a missing entity but still validates', async () => {
    await seedData();
    const backup = await createBackup(db);
    delete backup.data.budgets;
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/does not contain "budgets"/);
  });
});

describe('restore', () => {
  it('round-trips: export, wipe, restore, and the data is identical', async () => {
    const { cash } = await seedData();
    const backup = await createBackup(db);

    // Wipe everything.
    await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM "Transaction"');
      await tx.execute('DELETE FROM "Account"');
    });
    expect(await transactions.getTransactions(LOCAL_USER_ID)).toMatchObject({
      pagination: { total: 0 }
    });

    const result = await restoreBackup(db, backup, { userId: LOCAL_USER_ID });
    expect(result.verified).toBe(true);

    const restored = await transactions.getTransactions(LOCAL_USER_ID);
    expect(restored.pagination.total).toBe(2);

    // The balance must be exactly what it was: 1000.00 opening + 250.50 income.
    const accountsAfter = await accounts.getAccounts(LOCAL_USER_ID);
    const cashAfter = accountsAfter.find((a) => a.id === cash.id);
    expect(cashAfter.balance).toBe(1250.5);
  });

  it('restores a backup into a different (clean) database', async () => {
    await seedData();
    const backup = await createBackup(db);

    const other = openNodeDatabase(':memory:');
    await bootstrap(other);

    const result = await restoreBackup(other, backup, { userId: LOCAL_USER_ID });
    expect(result.verified).toBe(true);

    const rows = await other.select('SELECT COUNT(*) AS c FROM "Transaction"');
    expect(Number(rows[0].c)).toBe(2);

    const balance = await other.select('SELECT balance FROM "Account" WHERE name = ?', ['Cash']);
    expect(balance[0].balance).toBe(125050); // 1000.00 opening + 250.50 income

    other.close();
  });

  it('merges without duplicating rows that already exist', async () => {
    await seedData();
    const backup = await createBackup(db);

    const result = await restoreBackup(db, backup, { mode: 'merge', userId: LOCAL_USER_ID });
    expect(result.mode).toBe('merge');

    const rows = await db.select('SELECT COUNT(*) AS c FROM "Transaction"');
    expect(Number(rows[0].c)).toBe(2); // still 2, not 4
  });

  it('leaves existing data untouched when the import fails', async () => {
    await seedData();
    const before = await db.select('SELECT COUNT(*) AS c FROM "Transaction"');

    // A backup with a row that violates a NOT NULL constraint.
    const backup = await createBackup(db);
    backup.data.transactions.push({
      id: 'broken',
      type: 'EXPENSE',
      amount: 100,
      date: new Date().toISOString(),
      userId: LOCAL_USER_ID,
      accountId: null, // NOT NULL
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await expect(restoreBackup(db, backup, { userId: LOCAL_USER_ID })).rejects.toThrow();

    const after = await db.select('SELECT COUNT(*) AS c FROM "Transaction"');
    expect(Number(after[0].c)).toBe(Number(before[0].c));
  });

  it('verifies a restore and reports problems', async () => {
    await seedData();
    const backup = await createBackup(db);
    const verification = await verifyRestore(db, backup);
    expect(verification.ok).toBe(true);
    expect(verification.problems).toHaveLength(0);
  });

  it('takes a safety backup before a destructive restore', async () => {
    await seedData();
    const safety = await createSafetyBackup(db);
    expect(safety.counts.transactions).toBe(2);
    expect(safety.appVersion).toBe('safety-snapshot');
  });
});
