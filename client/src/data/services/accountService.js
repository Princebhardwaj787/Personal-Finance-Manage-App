/**
 * LOCAL ACCOUNT SERVICE (Android conversion — Phase C)
 * ===================================================
 * The on-device counterpart of `server/src/services/accountService.js`.
 *
 * Same behaviour, same guards, same error messages — but backed by raw SQL
 * against the local database instead of Prisma. The parity test suite
 * exercises both implementations on the same fixtures.
 *
 * Money note: `balance` is stored as INTEGER minor units and is exposed to
 * the UI as DECIMAL major units, exactly like the server's API.
 */

import { AppError } from '@shared/AppError.js';
import { toMinorUnits, fromMinorUnits } from '@shared/money.js';
import { makeId } from '../schema.js';

const now = () => new Date().toISOString();

/** Convert a stored account row into the shape the UI expects. */
const serializeAccount = (row) => ({
  ...row,
  balance: fromMinorUnits(row.balance),
  lowBalanceThreshold:
    row.lowBalanceThreshold === null || row.lowBalanceThreshold === undefined
      ? null
      : fromMinorUnits(row.lowBalanceThreshold)
});

/**
 * @param {import('../db.js').Database} db
 */
export const createAccountService = (db) => ({
  async getAccounts(userId) {
    const accounts = await db.select(
      `SELECT * FROM "Account" WHERE userId = ? ORDER BY "isDefault" DESC, "createdAt" ASC`,
      [userId]
    );

    if (accounts.length === 0) return [];

    // One aggregate instead of one count query per account.
    const counts = await db.select(
      `SELECT
         a.id AS accountId,
         (SELECT COUNT(*) FROM "Transaction" t WHERE t.accountId = a.id) AS transactions,
         (SELECT COUNT(*) FROM "Transfer" f WHERE f."fromAccountId" = a.id) AS transfersFrom,
         (SELECT COUNT(*) FROM "Transfer" t WHERE t."toAccountId" = a.id) AS transfersTo
       FROM "Account" a WHERE a.userId = ?`,
      [userId]
    );
    const countById = new Map(counts.map((c) => [c.accountId, c]));

    return accounts.map((account) => ({
      ...serializeAccount(account),
      _count: {
        transactions: Number(countById.get(account.id)?.transactions ?? 0),
        transfersFrom: Number(countById.get(account.id)?.transfersFrom ?? 0),
        transfersTo: Number(countById.get(account.id)?.transfersTo ?? 0)
      }
    }));
  },

  async getAccountById(userId, accountId) {
    const rows = await db.select('SELECT * FROM "Account" WHERE id = ? AND userId = ?', [
      accountId,
      userId
    ]);
    if (rows.length === 0) throw new AppError('Account not found', 404);

    const transactions = await db.select(
      `SELECT t.*, c.name AS categoryName
       FROM "Transaction" t
       LEFT JOIN "Category" c ON c.id = t.categoryId
       WHERE t.accountId = ? AND t.userId = ?
       ORDER BY t.date DESC LIMIT 10`,
      [accountId, userId]
    );

    return { ...serializeAccount(rows[0]), transactions };
  },

  async createAccount(userId, data) {
    const {
      name,
      type,
      balance = 0,
      currency = 'INR',
      icon,
      color,
      isDefault = false,
      lowBalanceThreshold = null
    } = data;

    if (!name || !String(name).trim()) throw new AppError('Account name is required', 400);
    if (!type) throw new AppError('Account type is required', 400);

    const created = await db.transaction(async (tx) => {
      if (isDefault) {
        await tx.execute('UPDATE "Account" SET "isDefault" = 0 WHERE userId = ?', [userId]);
      }

      const timestamp = now();
      const id = makeId();
      await tx.execute(
        `INSERT INTO "Account"
           (id, name, type, balance, currency, icon, color, "isDefault", "lowBalanceThreshold", userId, "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(name).trim(),
          type,
          toMinorUnits(balance),
          currency,
          icon ?? null,
          color ?? null,
          isDefault ? 1 : 0,
          lowBalanceThreshold === null || lowBalanceThreshold === undefined
            ? null
            : toMinorUnits(lowBalanceThreshold),
          userId,
          timestamp,
          timestamp
        ]
      );

      const rows = await tx.select('SELECT * FROM "Account" WHERE id = ?', [id]);
      return rows[0];
    });

    return serializeAccount(created);
  },

  async updateAccount(userId, accountId, data) {
    const existing = await db.select('SELECT * FROM "Account" WHERE id = ? AND userId = ?', [
      accountId,
      userId
    ]);
    if (existing.length === 0) throw new AppError('Account not found', 404);

    const current = existing[0];
    const { name, type, icon, color, isDefault, currency, lowBalanceThreshold } = data;

    const updated = await db.transaction(async (tx) => {
      if (isDefault && !current.isDefault) {
        await tx.execute('UPDATE "Account" SET "isDefault" = 0 WHERE userId = ?', [userId]);
      }

      const timestamp = now();
      await tx.execute(
        `UPDATE "Account" SET
           name = ?, type = ?, icon = ?, color = ?, "isDefault" = ?, currency = ?,
           "lowBalanceThreshold" = ?, "updatedAt" = ?
         WHERE id = ? AND userId = ?`,
        [
          name ?? current.name,
          type ?? current.type,
          icon === undefined ? current.icon : icon,
          color === undefined ? current.color : color,
          isDefault === undefined ? current.isDefault : isDefault ? 1 : 0,
          currency ?? current.currency,
          lowBalanceThreshold === undefined
            ? current.lowBalanceThreshold
            : lowBalanceThreshold === null
              ? null
              : toMinorUnits(lowBalanceThreshold),
          timestamp,
          accountId,
          userId
        ]
      );

      const rows = await tx.select('SELECT * FROM "Account" WHERE id = ?', [accountId]);
      return rows[0];
    });

    return serializeAccount(updated);
  },

  async deleteAccount(userId, accountId) {
    const existing = await db.select('SELECT * FROM "Account" WHERE id = ? AND userId = ?', [
      accountId,
      userId
    ]);
    if (existing.length === 0) throw new AppError('Account not found', 404);

    const counts = await db.select(
      `SELECT
         (SELECT COUNT(*) FROM "Transaction" t WHERE t.accountId = ?) AS transactions,
         (SELECT COUNT(*) FROM "Transfer" f WHERE f."fromAccountId" = ?) AS transfersFrom,
         (SELECT COUNT(*) FROM "Transfer" t WHERE t."toAccountId" = ?) AS transfersTo`,
      [accountId, accountId, accountId]
    );
    const row = counts[0];

    if (Number(row.transactions) > 0) {
      throw new AppError('Cannot delete account with existing transactions', 400);
    }
    if (Number(row.transfersFrom) > 0 || Number(row.transfersTo) > 0) {
      throw new AppError('Cannot delete account with existing transfers', 400);
    }
    if (existing[0].isDefault) {
      throw new AppError(
        'Cannot delete default account. Set another account as default first.',
        400
      );
    }

    await db.execute('DELETE FROM "Account" WHERE id = ? AND userId = ?', [accountId, userId]);
    return { success: true };
  },

  async getAccountBalance(userId, accountId) {
    const rows = await db.select('SELECT balance FROM "Account" WHERE id = ? AND userId = ?', [
      accountId,
      userId
    ]);
    if (rows.length === 0) throw new AppError('Account not found', 404);
    return fromMinorUnits(rows[0].balance);
  }
});

export default createAccountService;
