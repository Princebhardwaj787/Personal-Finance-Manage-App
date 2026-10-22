/**
 * LOCAL DATA SERVICE TESTS (Android conversion — Phase C)
 * =======================================================
 * These exercise the on-device data layer against a REAL SQLite database.
 * They are the safety net for the financial rules: balances must be exact,
 * transfers must never look like income or expense, and a failed write must
 * never leave a balance out of step.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { openNodeDatabase } from '../adapters/nodeSqlite.js';
import { bootstrap, LOCAL_USER_ID } from '../schema.js';
import { createAccountService } from './accountService.js';
import { createCategoryService } from './categoryService.js';
import { createTransactionService } from './transactionService.js';
import { createTransferService } from './transferService.js';

let db;
let accounts;
let categories;
let transactions;
let transfers;

const balanceOf = async (accountId) => {
  const rows = await db.select('SELECT balance FROM "Account" WHERE id = ?', [accountId]);
  return rows[0].balance; // minor units
};

const netWorth = async () => {
  const rows = await db.select('SELECT SUM(balance) AS total FROM "Account"');
  return Number(rows[0]?.total ?? 0);
};

const EXPENSE_CATEGORY = () =>
  categories.getCategoriesByType(LOCAL_USER_ID, 'EXPENSE').then((list) => list[0]?.id);

beforeEach(async () => {
  db = openNodeDatabase(':memory:');
  await bootstrap(db);
  accounts = createAccountService(db);
  categories = createCategoryService(db);
  transactions = createTransactionService(db);
  transfers = createTransferService(db);
});

afterAll(() => {
  db?.close?.();
});

describe('local account service', () => {
  it('creates an account with a decimal balance and stores minor units', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash',
      type: 'CASH',
      balance: 1000.5,
      currency: 'INR'
    });

    expect(account.balance).toBe(1000.5);
    expect(await balanceOf(account.id)).toBe(100050);
  });

  it('refuses to delete an account that has transactions', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 100
    });
    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 10, accountId: account.id
    });

    await expect(accounts.deleteAccount(LOCAL_USER_ID, account.id)).rejects.toThrow(
      /Cannot delete account with existing transactions/
    );
  });

  it('refuses to delete the default account', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0, isDefault: true
    });
    await expect(accounts.deleteAccount(LOCAL_USER_ID, account.id)).rejects.toThrow(
      /Cannot delete default account/
    );
  });

  it('keeps only one default account', async () => {
    const first = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'First', type: 'CASH', balance: 0, isDefault: true
    });
    const second = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Second', type: 'BANK', balance: 0, isDefault: true
    });

    const all = await accounts.getAccounts(LOCAL_USER_ID);
    const defaults = all.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.id);
    expect(first.id).not.toBe(second.id);
  });
});

describe('local category service', () => {
  it('rejects a duplicate name for the same user and type', async () => {
    await categories.createCategory(LOCAL_USER_ID, { name: 'Food', type: 'EXPENSE' });
    await expect(
      categories.createCategory(LOCAL_USER_ID, { name: 'Food', type: 'EXPENSE' })
    ).rejects.toThrow(/already exists/);
  });

  it('allows the same name for a different type', async () => {
    await categories.createCategory(LOCAL_USER_ID, { name: 'Food', type: 'EXPENSE' });
    const income = await categories.createCategory(LOCAL_USER_ID, { name: 'Food', type: 'INCOME' });
    expect(income.id).toBeDefined();
  });

  it('rejects an unknown category type', async () => {
    await expect(
      categories.createCategory(LOCAL_USER_ID, { name: 'X', type: 'NOPE' })
    ).rejects.toThrow(/must be one of/);
  });
});

describe('local transaction service', () => {
  it('applies the exact balance change for income and expense', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 1000
    });
    const before = await balanceOf(account.id);

    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'INCOME', amount: 250.5, accountId: account.id
    });
    expect(await balanceOf(account.id)).toBe(before + 25050);

    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 100, accountId: account.id
    });
    expect(await balanceOf(account.id)).toBe(before + 25050 - 10000);
  });

  it('returns decimal amounts to the caller', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    const created = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 100.5, accountId: account.id
    });
    expect(created.amount).toBe(100.5);
  });

  it('rejects a transaction whose category type does not match', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    const incomeCategory = (await categories.getCategoriesByType(LOCAL_USER_ID, 'INCOME'))[0];

    await expect(
      transactions.createTransaction(LOCAL_USER_ID, {
        type: 'EXPENSE', amount: 10, accountId: account.id, categoryId: incomeCategory.id
      })
    ).rejects.toThrow(/Invalid category/);
  });

  it('rejects a non-positive amount', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    await expect(
      transactions.createTransaction(LOCAL_USER_ID, {
        type: 'EXPENSE', amount: 0, accountId: account.id
      })
    ).rejects.toThrow(/greater than 0/);
  });

  it('reverses the old delta and applies the new one when edited', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    const created = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'INCOME', amount: 100, accountId: account.id
    });
    expect(await balanceOf(account.id)).toBe(10000);

    const updated = await transactions.updateTransaction(LOCAL_USER_ID, created.id, {
      type: 'INCOME', amount: 300, accountId: account.id
    });
    expect(updated.amount).toBe(300);
    expect(await balanceOf(account.id)).toBe(30000);
  });

  it('fully reverses the balance impact when deleted', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 500
    });
    const before = await balanceOf(account.id);
    const created = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 100, accountId: account.id
    });
    expect(await balanceOf(account.id)).toBe(before - 10000);

    await transactions.deleteTransaction(LOCAL_USER_ID, created.id);
    expect(await balanceOf(account.id)).toBe(before);
  });

  it('duplicates into an independent record with its own balance impact', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    const original = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 100, accountId: account.id
    });
    const copy = await transactions.duplicateTransaction(LOCAL_USER_ID, original.id);

    expect(copy.id).not.toBe(original.id);
    expect(copy.amount).toBe(100);
    expect(await balanceOf(account.id)).toBe(-20000);
  });

  it('moves a transaction to another account and fixes both balances', async () => {
    const cash = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 1000
    });
    const bank = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Bank', type: 'BANK', balance: 0
    });

    const created = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 100, accountId: cash.id
    });
    expect(await balanceOf(cash.id)).toBe(100000 - 10000);

    await transactions.updateTransaction(LOCAL_USER_ID, created.id, {
      accountId: bank.id, amount: 100, type: 'EXPENSE'
    });

    expect(await balanceOf(cash.id)).toBe(100000);
    expect(await balanceOf(bank.id)).toBe(-10000);
  });

  it('bulk-deletes atomically and reverses every balance', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 1000
    });
    const before = await balanceOf(account.id);

    const a = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 10, accountId: account.id
    });
    const b = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 20, accountId: account.id
    });

    const result = await transactions.bulkDeleteTransactions(LOCAL_USER_ID, [a.id, b.id]);
    expect(result.deleted).toBe(2);
    expect(await balanceOf(account.id)).toBe(before);
  });

  it('refuses a bulk delete that includes an unknown id', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    const a = await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 10, accountId: account.id
    });

    await expect(
      transactions.bulkDeleteTransactions(LOCAL_USER_ID, [a.id, 'does-not-exist'])
    ).rejects.toThrow(/not found/);

    // The valid id must NOT have been deleted (all-or-nothing).
    const remaining = await transactions.getTransactions(LOCAL_USER_ID);
    expect(remaining.pagination.total).toBe(1);
  });

  it('filters by amount range using decimal input', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    for (const amount of [50, 150, 250]) {
      await transactions.createTransaction(LOCAL_USER_ID, {
        type: 'EXPENSE', amount, accountId: account.id
      });
    }

    const result = await transactions.getTransactions(LOCAL_USER_ID, {
      minAmount: 100,
      maxAmount: 200
    });
    expect(result.pagination.total).toBe(1);
    expect(result.transactions[0].amount).toBe(150);
  });

  it('searches across description, notes and category name', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 10, accountId: account.id, description: 'Coffee beans'
    });
    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 20, accountId: account.id, description: 'Rent', notes: 'monthly'
    });

    const byDescription = await transactions.getTransactions(LOCAL_USER_ID, { search: 'coffee' });
    expect(byDescription.pagination.total).toBe(1);

    const byNotes = await transactions.getTransactions(LOCAL_USER_ID, { search: 'monthly' });
    expect(byNotes.pagination.total).toBe(1);
  });

  it('summarises income and expense for a period', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'INCOME', amount: 1000, accountId: account.id
    });
    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 250.5, accountId: account.id
    });

    const summary = await transactions.getTransactionSummary(LOCAL_USER_ID);
    expect(summary.totalIncome).toBe(1000);
    expect(summary.totalExpenses).toBe(250.5);
    expect(summary.netSavings).toBe(749.5);
  });

  it('keeps a category count on the category list', async () => {
    const account = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 0
    });
    const categoryId = await EXPENSE_CATEGORY();
    await transactions.createTransaction(LOCAL_USER_ID, {
      type: 'EXPENSE', amount: 10, accountId: account.id, categoryId
    });

    const list = await categories.getCategories(LOCAL_USER_ID, 'EXPENSE');
    const used = list.find((c) => c.id === categoryId);
    expect(used._count.transactions).toBe(1);
  });
});

describe('local transfer service', () => {
  it('moves money between accounts without changing net worth', async () => {
    const cash = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 1000
    });
    const bank = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Bank', type: 'BANK', balance: 0
    });
    const beforeWorth = await netWorth();

    await transfers.createTransfer(LOCAL_USER_ID, {
      fromAccountId: cash.id, toAccountId: bank.id, amount: 250
    });

    expect(await balanceOf(cash.id)).toBe(100000 - 25000);
    expect(await balanceOf(bank.id)).toBe(25000);
    expect(await netWorth()).toBe(beforeWorth);
  });

  it('is never counted as income or expense', async () => {
    const cash = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 1000
    });
    const bank = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Bank', type: 'BANK', balance: 0
    });
    await transfers.createTransfer(LOCAL_USER_ID, {
      fromAccountId: cash.id, toAccountId: bank.id, amount: 250
    });

    const summary = await transactions.getTransactionSummary(LOCAL_USER_ID);
    expect(summary.totalIncome).toBe(0);
    expect(summary.totalExpenses).toBe(0);
  });

  it('rejects an overdraft and leaves both balances untouched', async () => {
    const cash = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 100
    });
    const bank = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Bank', type: 'BANK', balance: 0
    });
    const beforeCash = await balanceOf(cash.id);
    const beforeBank = await balanceOf(bank.id);

    await expect(
      transfers.createTransfer(LOCAL_USER_ID, {
        fromAccountId: cash.id, toAccountId: bank.id, amount: 500
      })
    ).rejects.toThrow(/Insufficient balance/);

    expect(await balanceOf(cash.id)).toBe(beforeCash);
    expect(await balanceOf(bank.id)).toBe(beforeBank);
  });

  it('refuses a transfer to the same account', async () => {
    const cash = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 100
    });
    await expect(
      transfers.createTransfer(LOCAL_USER_ID, {
        fromAccountId: cash.id, toAccountId: cash.id, amount: 10
      })
    ).rejects.toThrow(/same account/);
  });

  it('reverses the old movement when a transfer is edited', async () => {
    const cash = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 1000
    });
    const bank = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Bank', type: 'BANK', balance: 0
    });

    const created = await transfers.createTransfer(LOCAL_USER_ID, {
      fromAccountId: cash.id, toAccountId: bank.id, amount: 100
    });
    await transfers.updateTransfer(LOCAL_USER_ID, created.id, {
      fromAccountId: cash.id, toAccountId: bank.id, amount: 200
    });

    expect(await balanceOf(cash.id)).toBe(100000 - 20000);
    expect(await balanceOf(bank.id)).toBe(20000);
  });

  it('restores both balances when a transfer is deleted', async () => {
    const cash = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Cash', type: 'CASH', balance: 1000
    });
    const bank = await accounts.createAccount(LOCAL_USER_ID, {
      name: 'Bank', type: 'BANK', balance: 0
    });

    const created = await transfers.createTransfer(LOCAL_USER_ID, {
      fromAccountId: cash.id, toAccountId: bank.id, amount: 100
    });
    await transfers.deleteTransfer(LOCAL_USER_ID, created.id);

    expect(await balanceOf(cash.id)).toBe(100000);
    expect(await balanceOf(bank.id)).toBe(0);
  });
});
