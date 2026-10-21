/**
 * INTEGRATION TESTS — BALANCE CORRECTNESS (Phase 1 §3)
 * ====================================================
 * Runs against `test.db` (isolated), never `dev.db`.
 * Verifies that integer minor-unit arithmetic keeps account balances and
 * net worth exactly correct across create/update/delete/transfer cycles.
 *
 * All assertions work in raw minor units (paise) as stored in the DB, so
 * there is no double conversion between the service layer and the test.
 */

import { describe, it, beforeEach, afterAll, expect } from 'vitest';
import { prisma, truncateAllTables, disconnectDb } from '../helpers/db.js';
import { seedFixture } from '../helpers/seed.js';
import * as transactionService from '../../src/services/transactionService.js';
import * as transferService from '../../src/services/transferService.js';

const AMOUNT_MINOR = 25000; // ₹250.00 in minor units

describe('balance correctness', () => {
  let user;
  let accounts;

  beforeEach(async () => {
    await truncateAllTables();
    ({ user, accounts } = await seedFixture());
  });

  afterAll(async () => {
    await disconnectDb();
  });

  const getBalance = async (accountId) => {
    const acct = await prisma.account.findUnique({ where: { id: accountId } });
    return acct.balance; // raw minor units
  };

  const netWorth = async () => {
    const agg = await prisma.account.aggregate({
      where: { userId: user.id },
      _sum: { balance: true }
    });
    return agg._sum.balance ?? 0; // raw minor units
  };

  it('increases account balance on income and decreases on expense', async () => {
    const [cash, bank] = accounts;
    const beforeCash = await getBalance(cash.id);
    const beforeBank = await getBalance(bank.id);

    // Income of ₹250.00 (25000 minor units) into Cash. Decimal input -> converted by service.
    await transactionService.createTransaction(user.id, {
      type: 'INCOME',
      amount: AMOUNT_MINOR / 100,
      accountId: cash.id,
      categoryId: null,
      description: 'Salary'
    });

    expect(await getBalance(cash.id)).toBe(beforeCash + AMOUNT_MINOR);
    expect(await getBalance(bank.id)).toBe(beforeBank); // untouched
    expect(await netWorth()).toBe(beforeCash + beforeBank + AMOUNT_MINOR);

    // Expense of ₹100.00 (10000 minor units) from Cash.
    await transactionService.createTransaction(user.id, {
      type: 'EXPENSE',
      amount: 100.00,
      accountId: cash.id,
      categoryId: null,
      description: 'Groceries'
    });

    expect(await getBalance(cash.id)).toBe(beforeCash + AMOUNT_MINOR - 10000);
    expect(await netWorth()).toBe(beforeCash + beforeBank + AMOUNT_MINOR - 10000);
  });

  it('transfer moves money between accounts without changing net worth', async () => {
    const [cash, bank] = accounts;
    const beforeCash = await getBalance(cash.id);
    const beforeBank = await getBalance(bank.id);

    await transferService.createTransfer(user.id, {
      fromAccountId: cash.id,
      toAccountId: bank.id,
      amount: AMOUNT_MINOR / 100, // ₹250.00 decimal
      description: 'Cash to bank'
    });

    expect(await getBalance(cash.id)).toBe(beforeCash - AMOUNT_MINOR);
    expect(await getBalance(bank.id)).toBe(beforeBank + AMOUNT_MINOR);
    // Net worth unchanged — transfers are not income/expense.
    expect(await netWorth()).toBe(beforeCash + beforeBank);
  });

  it('rejects transfer with insufficient balance atomically', async () => {
    const [cash, bank] = accounts;
    const beforeCash = await getBalance(cash.id);
    const beforeBank = await getBalance(bank.id);

    // Attempt to transfer more than the cash balance.
    await expect(
      transferService.createTransfer(user.id, {
        fromAccountId: cash.id,
        toAccountId: bank.id,
        amount: (beforeCash / 100) + 1, // more than balance (decimal)
        description: 'Overdraft'
      })
    ).rejects.toThrow();

    expect(await getBalance(cash.id)).toBe(beforeCash);
    expect(await getBalance(bank.id)).toBe(beforeBank);
    expect(await netWorth()).toBe(beforeCash + beforeBank);
  });

  it('updating a transaction reverses the old delta and applies the new one', async () => {
    const [cash] = accounts;
    const beforeCash = await getBalance(cash.id);

    // Create ₹100.00 income.
    const created = await transactionService.createTransaction(user.id, {
      type: 'INCOME',
      amount: 100.00,
      accountId: cash.id,
      categoryId: null,
      description: 'Initial'
    });
    expect(await getBalance(cash.id)).toBe(beforeCash + 10000);

    // Update to ₹300.00 income → delta +200.00 more.
    const updated = await transactionService.updateTransaction(user.id, created.id, {
      amount: 300.00,
      type: 'INCOME',
      accountId: cash.id,
      categoryId: null
    });
    expect(await getBalance(cash.id)).toBe(beforeCash + 30000);
    expect(updated.amount).toBe(300); // API returns decimal
  });

  it('deleting a transaction fully reverses its balance impact', async () => {
    const [cash] = accounts;
    const beforeCash = await getBalance(cash.id);
    const beforeNet = await netWorth();

    const created = await transactionService.createTransaction(user.id, {
      type: 'INCOME',
      amount: 500.00,
      accountId: cash.id,
      categoryId: null,
      description: 'To be deleted'
    });
    expect(await getBalance(cash.id)).toBe(beforeCash + 50000);

    await transactionService.deleteTransaction(user.id, created.id);
    expect(await getBalance(cash.id)).toBe(beforeCash);
    expect(await netWorth()).toBe(beforeNet);
  });

  it('editing a transfer reverses old movement and applies new one', async () => {
    const [cash, bank] = accounts;
    const beforeCash = await getBalance(cash.id);
    const beforeBank = await getBalance(bank.id);

    const created = await transferService.createTransfer(user.id, {
      fromAccountId: cash.id,
      toAccountId: bank.id,
      amount: 100.00,
      description: 'Initial transfer'
    });
    expect(await getBalance(cash.id)).toBe(beforeCash - 10000);
    expect(await getBalance(bank.id)).toBe(beforeBank + 10000);

    // Change amount to ₹200.00 → cash loses another 100, bank gains another 100.
    const updated = await transferService.updateTransfer(user.id, created.id, {
      amount: 200.00,
      fromAccountId: cash.id,
      toAccountId: bank.id
    });
    expect(await getBalance(cash.id)).toBe(beforeCash - 20000);
    expect(await getBalance(bank.id)).toBe(beforeBank + 20000);
    expect(await netWorth()).toBe(beforeCash + beforeBank);
    expect(updated.amount).toBe(200);
  });

  it('duplicate creates an independent record with its own balance impact', async () => {
    const [cash] = accounts;
    const beforeCash = await getBalance(cash.id);

    const original = await transactionService.createTransaction(user.id, {
      type: 'EXPENSE',
      amount: 100.00,
      accountId: cash.id,
      categoryId: null,
      description: 'Original'
    });

    const duplicated = await transactionService.duplicateTransaction(user.id, original.id);
    expect(duplicated.id).not.toBe(original.id);
    expect(duplicated.amount).toBe(100);
    expect(await getBalance(cash.id)).toBe(beforeCash - 20000); // both applied
  });
});
