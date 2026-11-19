/**
 * LOCAL DATABASE TESTS (Android conversion — Phase C)
 * ==================================================
 * These run against a REAL SQLite database (Node's built-in `node:sqlite`),
 * so the exact SQL that ships to the device is exercised here.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { openNodeDatabase } from './adapters/nodeSqlite.js';
import { bootstrap, SCHEMA_VERSION, LOCAL_USER_ID } from './schema.js';

let db;

beforeEach(async () => {
  db = openNodeDatabase(':memory:');
  await bootstrap(db);
});

afterAll(() => {
  db?.close?.();
});

describe('local database bootstrap', () => {
  it('creates every table the application needs', async () => {
    const tables = await db.select(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const names = tables.map((t) => t.name);

    for (const expected of [
      'User', 'Category', 'Account', 'Transaction', 'Budget',
      'SavingsGoal', 'SavingsContribution', 'RecurringExpense',
      'Transfer', 'RecurringOccurrence', 'ReportHistory',
      'Notification', 'NotificationPreference', 'AuditEvent',
      'AppSetting', '_LocalMigrations',
      'Debt', 'DebtPayment', 'Investment', 'InvestmentTransaction', 'Document'
    ]) {
      expect(names, `missing table ${expected}`).toContain(expected);
    }
  });

  it('records the applied migration version', async () => {
    const rows = await db.select('SELECT version, name FROM "_LocalMigrations" ORDER BY version');
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].version)).toBe(1);
    expect(rows[0].name).toBe('initial_schema');
    expect(Number(rows[1].version)).toBe(SCHEMA_VERSION);
    expect(rows[1].name).toBe('add_debt_investment_document_and_transaction_fields');
  });

  it('is idempotent — running bootstrap again changes nothing', async () => {
    const before = await db.select('SELECT COUNT(*) AS c FROM "Category"');
    const again = await bootstrap(db);
    const after = await db.select('SELECT COUNT(*) AS c FROM "Category"');

    expect(again.applied).toHaveLength(0);
    expect(after[0].c).toBe(before[0].c);
  });

  it('creates the single local user and the default categories', async () => {
    const users = await db.select('SELECT id, email FROM "User"');
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(LOCAL_USER_ID);

    const categories = await db.select('SELECT type, COUNT(*) AS c FROM "Category" GROUP BY type');
    const byType = Object.fromEntries(categories.map((r) => [r.type, Number(r.c)]));
    expect(byType.INCOME).toBeGreaterThan(0);
    expect(byType.EXPENSE).toBeGreaterThan(0);
  });
});

describe('money storage', () => {
  it('stores monetary values as INTEGER minor units', async () => {
    await db.execute(
      'INSERT INTO "Account" (id, name, type, balance, currency, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['a1', 'Cash', 'CASH', 100050, 'INR', LOCAL_USER_ID, new Date().toISOString(), new Date().toISOString()]
    );

    const row = await db.select('SELECT balance FROM "Account" WHERE id = ?', ['a1']);
    expect(row[0].balance).toBe(100050);
    expect(Number.isInteger(row[0].balance)).toBe(true);
  });

  it('declares monetary columns as INTEGER', async () => {
    const columns = await db.select('PRAGMA table_info("Transaction")');
    const amount = columns.find((c) => c.name === 'amount');
    expect(amount.type).toBe('INTEGER');

    const accountColumns = await db.select('PRAGMA table_info("Account")');
    expect(accountColumns.find((c) => c.name === 'balance').type).toBe('INTEGER');
  });
});

describe('constraints and indexes', () => {
  it('enforces foreign keys', async () => {
    await expect(
      db.execute(
        'INSERT INTO "Transaction" (id, type, amount, date, userId, accountId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['t1', 'EXPENSE', 100, new Date().toISOString(), 'no-such-user', 'no-such-account', new Date().toISOString(), new Date().toISOString()]
      )
    ).rejects.toThrow();
  });

  it('enforces the unique category name per user and type', async () => {
    const now = new Date().toISOString();
    await db.execute(
      'INSERT INTO "Category" (id, name, type, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
      ['c1', 'Food', 'EXPENSE', LOCAL_USER_ID, now, now]
    );
    await expect(
      db.execute(
        'INSERT INTO "Category" (id, name, type, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
        ['c2', 'Food', 'EXPENSE', LOCAL_USER_ID, now, now]
      )
    ).rejects.toThrow();
  });

  it('enforces the recurring-occurrence idempotency key', async () => {
    const now = new Date().toISOString();
    await db.execute(
      'INSERT INTO "Account" (id, name, type, balance, currency, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['a1', 'Cash', 'CASH', 10000, 'INR', LOCAL_USER_ID, now, now]
    );
    await db.execute(
      'INSERT INTO "Category" (id, name, type, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
      ['c1', 'Rent', 'EXPENSE', LOCAL_USER_ID, now, now]
    );
    await db.execute(
      'INSERT INTO "RecurringExpense" (id, name, amount, frequency, "nextDueDate", "isActive", userId, accountId, categoryId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['r1', 'Rent', 100000, 'MONTHLY', now, true, LOCAL_USER_ID, 'a1', 'c1', now, now]
    );
    await db.execute(
      'INSERT INTO "RecurringOccurrence" (id, "recurringExpenseId", userId, "dueDate", status, "attemptCount", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['o1', 'r1', LOCAL_USER_ID, now, 'CREATED', 1, now, now]
    );
    await expect(
      db.execute(
        'INSERT INTO "RecurringOccurrence" (id, "recurringExpenseId", userId, "dueDate", status, "attemptCount", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['o2', 'r1', LOCAL_USER_ID, now, 'CREATED', 1, now, now]
      )
    ).rejects.toThrow();
  });

  it('creates the indexes the queries rely on', async () => {
    const indexes = await db.select("SELECT name FROM sqlite_master WHERE type='index'");
    const names = indexes.map((i) => i.name);

    for (const expected of [
      'Transaction_userId_date_idx',
      'Transaction_userId_type_date_idx',
      'Transaction_userId_accountId_idx',
      'Account_userId_idx',
      'Budget_userId_month_year_idx',
      'Transfer_userId_date_idx',
      'Notification_userId_dedupeKey_key'
    ]) {
      expect(names, `missing index ${expected}`).toContain(expected);
    }
  });
});

describe('transactions', () => {
  it('rolls back a failed transaction', async () => {
    const now = new Date().toISOString();
    await db.execute(
      'INSERT INTO "Account" (id, name, type, balance, currency, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['a1', 'Cash', 'CASH', 10000, 'INR', LOCAL_USER_ID, now, now]
    );

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          'INSERT INTO "Account" (id, name, type, balance, currency, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ['a2', 'Bank', 'BANK', 0, 'INR', LOCAL_USER_ID, now, now]
        );
        // Force a failure: the account id already exists.
        await tx.execute(
          'INSERT INTO "Account" (id, name, type, balance, currency, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ['a2', 'Dup', 'BANK', 0, 'INR', LOCAL_USER_ID, now, now]
        );
      })
    ).rejects.toThrow();

    // The first insert must have been rolled back.
    const accounts = await db.select('SELECT id FROM "Account"');
    expect(accounts.map((a) => a.id)).toEqual(['a1']);
  });

  it('commits a successful transaction', async () => {
    const now = new Date().toISOString();
    await db.execute(
      'INSERT INTO "Account" (id, name, type, balance, currency, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['a1', 'Cash', 'CASH', 10000, 'INR', LOCAL_USER_ID, now, now]
    );

    await db.transaction(async (tx) => {
      await tx.execute(
        'INSERT INTO "Account" (id, name, type, balance, currency, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['a2', 'Bank', 'BANK', 0, 'INR', LOCAL_USER_ID, now, now]
      );
    });

    const accounts = await db.select('SELECT id FROM "Account" ORDER BY id');
    expect(accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
  });
});
