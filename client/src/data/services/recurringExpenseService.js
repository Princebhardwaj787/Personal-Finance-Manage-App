/**
 * LOCAL RECURRING EXPENSE SERVICE (Android conversion — Phase C)
 * =============================================================
 * The on-device counterpart of `server/src/services/recurringExpenseService.js`
 * and `recurringProcessingService.js`.
 *
 * The processor is the delicate part. It keeps every guarantee the server
 * has:
 *  - IDEMPOTENCY: a `RecurringOccurrence` row keyed by
 *    (recurringExpenseId, dueDate) is claimed FIRST, inside the same
 *    transaction that creates the money-moving row. A second run of the
 *    processor is a no-op instead of a second charge.
 *  - MISSED OCCURRENCES: every past-due date gets its own transaction, but
 *    the run is capped so a long-dormant install cannot flood the ledger.
 *  - A FAILED occurrence stays due and is retried; the due date only
 *    advances past occurrences that actually succeeded.
 *  - The balance debit uses a conditional update (`balance >= amount`).
 */

import { AppError } from '@shared/AppError.js';
import { toMinorUnits, fromMinorUnits } from '@shared/money.js';
import {
  FREQUENCIES,
  summarize,
  daysUntil,
  serializeRecurringExpense
} from '@shared/recurringCalculator.js';
import {
  addUtcDays,
  addUtcMonths,
  daysInUtcMonth,
  toUtcDay,
  utcDay,
  parseIsoDay
} from '@shared/dateRange.js';
import { makeId } from '../schema.js';

export const DEFAULT_MAX_CATCH_UP = 12;
export const MAX_CATCH_UP_LIMIT = 60;
export const OCCURRENCE_STATUS = Object.freeze(['CREATED', 'FAILED']);
export const AUTO_NOTE_PREFIX = 'Auto-generated from recurring payment';

const MONTH_STEP = Object.freeze({ MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 });

const now = () => new Date().toISOString();

const parseDate = (value, field) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a valid date`, 400);
  return date.toISOString();
};

const assertPositive = (value, field) => {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new AppError(`${field} must be a number`, 400);
  if (num <= 0) throw new AppError(`${field} must be greater than 0`, 400);
  return toMinorUnits(num);
};

const assertFrequency = (value) => {
  if (!FREQUENCIES.includes(value)) {
    throw new AppError(`Frequency must be one of: ${FREQUENCIES.join(', ')}`, 400);
  }
  return value;
};

/** Control-flow marker: skip quietly (paused/deleted item — not a failure). */
class SkipOccurrence extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipOccurrence';
    this.skip = true;
  }
}

const dayString = (date) => date.toISOString().slice(0, 10);

/**
 * Due date after `n` steps from `anchor`.
 *
 * `anchorDay` re-applies the ORIGINAL day of the month after a clamping
 * step, so a "31st" schedule does not drift to the 28th forever.
 */
const stepDue = (anchor, n, frequency, anchorDay) => {
  if (n <= 0) return anchor;
  if (frequency === 'WEEKLY') return addUtcDays(anchor, 7 * n);

  const base = addUtcMonths(anchor, (MONTH_STEP[frequency] ?? 1) * n);
  if (!anchorDay || anchorDay <= base.getUTCDate()) return base;

  const days = daysInUtcMonth(base.getUTCFullYear(), base.getUTCMonth() + 1);
  return utcDay(base.getUTCFullYear(), base.getUTCMonth() + 1, Math.min(anchorDay, days));
};

/**
 * Day-of-month to keep after clamping. Only kicks in when the run anchor
 * was clamped onto the last day of a shorter month AND the log remembers a
 * later day.
 */
const resolveAnchorDay = (runAnchor, loggedDay) => {
  if (!loggedDay || loggedDay <= runAnchor.getUTCDate()) return runAnchor.getUTCDate();
  const lastDay = daysInUtcMonth(runAnchor.getUTCFullYear(), runAnchor.getUTCMonth() + 1);
  if (runAnchor.getUTCDate() === lastDay) return loggedDay;
  return runAnchor.getUTCDate();
};

/** Every due date for this run: anchor first, oldest → newest, hard capped. */
const enumerateDueDates = (anchor, frequency, anchorDay, asOfDay, max) => {
  const dates = [];
  for (let n = 0; n < 3660 && dates.length < max; n += 1) {
    const due = stepDue(anchor, n, frequency, anchorDay);
    if (due.getTime() > asOfDay.getTime()) break;
    dates.push(due);
  }
  return dates;
};

const assertIntInRange = (value, field, fallback, min, max) => {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(`${field} must be an integer between ${min} and ${max}`, 400);
  }
  return parsed;
};

export const createRecurringExpenseService = (db) => {
  const findOwned = async (userId, id) => {
    const rows = await db.select(
      `SELECT r.*, a.name AS accountName, a.currency AS accountCurrency,
              c.name AS categoryName, c.type AS categoryType
       FROM "RecurringExpense" r
       LEFT JOIN "Account" a ON a.id = r.accountId
       LEFT JOIN "Category" c ON c.id = r.categoryId
       WHERE r.id = ? AND r.userId = ?`,
      [id, userId]
    );
    if (rows.length === 0) throw new AppError('Recurring expense not found', 404);
    return rows[0];
  };

  /** The failure record: same unique key, attempt counter increments. */
  const recordFailure = async (recurringExpenseId, userId, dueDate, reason) => {
    const existing = await db.select(
      'SELECT status FROM "RecurringOccurrence" WHERE "recurringExpenseId" = ? AND "dueDate" = ?',
      [recurringExpenseId, dueDate]
    );
    // Never downgrade a CREATED record — that money already moved.
    if (existing[0]?.status === 'CREATED') return;

    const timestamp = now();
    const id = makeId();

    const updated = await db.execute(
      `UPDATE "RecurringOccurrence" SET status = 'FAILED', "failureReason" = ?, "attemptCount" = "attemptCount" + 1, "updatedAt" = ?
       WHERE "recurringExpenseId" = ? AND "dueDate" = ?`,
      [reason, timestamp, recurringExpenseId, dueDate]
    );

    if (updated.rowsAffected === 0) {
      await db.execute(
        `INSERT INTO "RecurringOccurrence"
           (id, "recurringExpenseId", userId, "dueDate", status, "failureReason", "attemptCount", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, 'FAILED', ?, 1, ?, ?)`,
        [id, recurringExpenseId, userId, dueDate, reason, timestamp, timestamp]
      );
    }
  };

  /**
   * Create ONE occurrence atomically: idempotency row → validations → balance
   * debit → transaction row → link → advance due date.
   */
  const createOccurrence = async (userId, item, dueDate, nextDueDate) => {
    const transactionId = makeId();
    const occurrenceId = makeId();
    const timestamp = now();

    await db.transaction(async (tx) => {
      // 1. Claim the occurrence FIRST — the unique index is the lock.
      const claimed = await tx.execute(
        `INSERT INTO "RecurringOccurrence"
           (id, "recurringExpenseId", userId, "dueDate", status, "attemptCount", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, 'CREATED', 1, ?, ?)`,
        [occurrenceId, item.id, userId, dueDate, timestamp, timestamp]
      );

      if (claimed.rowsAffected === 0) {
        throw new AppError('Occurrence already processed', 409);
      }

      // 2. Re-read the live row: a paused/deleted item is a skip.
      const liveRows = await tx.select(
        'SELECT id, name, amount, accountId, categoryId FROM "RecurringExpense" WHERE id = ? AND userId = ? AND "isActive" = 1',
        [item.id, userId]
      );
      if (liveRows.length === 0) {
        throw new SkipOccurrence('Recurring expense is paused or no longer exists');
      }
      const live = liveRows[0];

      // 3. Ownership checks: account and category belong to the caller.
      const accountRows = await tx.select(
        'SELECT id, name FROM "Account" WHERE id = ? AND userId = ?',
        [live.accountId, userId]
      );
      if (accountRows.length === 0) {
        throw new AppError('Account no longer exists for this recurring expense', 400);
      }

      const categoryRows = await tx.select(
        "SELECT id FROM \"Category\" WHERE id = ? AND userId = ? AND type = 'EXPENSE'",
        [live.categoryId, userId]
      );
      if (categoryRows.length === 0) {
        throw new AppError(
          'Category no longer exists, is not yours, or is not an EXPENSE category',
          400
        );
      }

      // 4. Debit with the balance condition inside the WHERE clause.
      const debited = await tx.execute(
        'UPDATE "Account" SET balance = balance - ? WHERE id = ? AND userId = ? AND balance >= ?',
        [live.amount, live.accountId, userId, live.amount]
      );
      if (debited.rowsAffected === 0) {
        const owned = await tx.select(
          'SELECT name, balance FROM "Account" WHERE id = ? AND userId = ?',
          [live.accountId, userId]
        );
        throw new AppError(
          `Insufficient balance in ${owned[0]?.name ?? 'account'} (available ${fromMinorUnits(owned[0]?.balance ?? 0)}, needed ${fromMinorUnits(live.amount)})`,
          400
        );
      }

      // 5. The actual money record.
      await tx.execute(
        `INSERT INTO "Transaction"
           (id, type, amount, description, notes, date, userId, accountId, categoryId, "recurringExpenseId", "createdAt", "updatedAt")
         VALUES (?, 'EXPENSE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          live.amount,
          live.description || live.name,
          `${AUTO_NOTE_PREFIX}: ${live.name}`,
          dueDate,
          userId,
          live.accountId,
          live.categoryId,
          live.id,
          timestamp,
          timestamp
        ]
      );

      // 6. Point the occurrence at the row it produced.
      await tx.execute(
        'UPDATE "RecurringOccurrence" SET "transactionId" = ?, "failureReason" = NULL, "updatedAt" = ? WHERE id = ?',
        [transactionId, timestamp, occurrenceId]
      );

      // 7. Advance the schedule only now that the money actually moved.
      await tx.execute(
        'UPDATE "RecurringExpense" SET "nextDueDate" = ?, "updatedAt" = ? WHERE id = ? AND userId = ?',
        [nextDueDate, timestamp, live.id, userId]
      );
    });

    return { transactionId, nextDueDate };
  };

  /** Read-only version used by `dryRun` previews. */
  const previewOccurrence = async (userId, item) => {
    const accountRows = await db.select(
      'SELECT balance, name FROM "Account" WHERE id = ? AND userId = ?',
      [item.accountId, userId]
    );
    const categoryRows = await db.select(
      "SELECT id FROM \"Category\" WHERE id = ? AND userId = ? AND type = 'EXPENSE'",
      [item.categoryId, userId]
    );
    const liveRows = await db.select(
      'SELECT id, amount FROM "RecurringExpense" WHERE id = ? AND userId = ? AND "isActive" = 1',
      [item.id, userId]
    );

    if (liveRows.length === 0) {
      return { outcome: 'would-skip', reason: 'Recurring expense is paused or no longer exists' };
    }
    if (accountRows.length === 0) {
      return { outcome: 'would-fail', reason: 'Account no longer exists for this recurring expense' };
    }
    if (categoryRows.length === 0) {
      return {
        outcome: 'would-fail',
        reason: 'Category no longer exists, is not yours, or is not an EXPENSE category'
      };
    }
    if (accountRows[0].balance < liveRows[0].amount) {
      return {
        outcome: 'would-fail',
        reason: `Insufficient balance in ${accountRows[0].name} (available ${fromMinorUnits(accountRows[0].balance)}, needed ${fromMinorUnits(liveRows[0].amount)})`
      };
    }
    return { outcome: 'would-create' };
  };

  return {
    async listRecurringExpenses(userId, { status = 'active' } = {}) {
      const clauses = ['r.userId = ?'];
      const params = [userId];

      if (status === 'active') clauses.push('r."isActive" = 1');
      else if (status === 'inactive') clauses.push('r."isActive" = 0');
      else if (status !== 'all') {
        throw new AppError('Status must be active, inactive or all', 400);
      }

      const rows = await db.select(
        `SELECT r.*, a.name AS accountName, a.currency AS accountCurrency,
                c.name AS categoryName, c.type AS categoryType
         FROM "RecurringExpense" r
         LEFT JOIN "Account" a ON a.id = r.accountId
         LEFT JOIN "Category" c ON c.id = r.categoryId
         WHERE ${clauses.join(' AND ')}
         ORDER BY r."nextDueDate" ASC`,
        params
      );

      return rows.map((row) => serializeRecurringExpense({
        ...row,
        account: row.accountName
          ? { id: row.accountId, name: row.accountName, currency: row.accountCurrency ?? 'INR' }
          : undefined,
        category: row.categoryName
          ? { id: row.categoryId, name: row.categoryName, type: row.categoryType }
          : undefined
      }));
    },

    async getRecurringExpense(userId, id) {
      const row = await findOwned(userId, id);
      return serializeRecurringExpense({
        ...row,
        account: row.accountName
          ? { id: row.accountId, name: row.accountName, currency: row.accountCurrency ?? 'INR' }
          : undefined,
        category: row.categoryName
          ? { id: row.categoryId, name: row.categoryName, type: row.categoryType }
          : undefined
      });
    },

    async createRecurringExpense(userId, payload) {
      const name = String(payload.name ?? '').trim();
      if (!name) throw new AppError('Name is required', 400);

      const amount = assertPositive(payload.amount, 'Amount');
      const frequency = assertFrequency(payload.frequency);
      const nextDueDate = parseDate(payload.nextDueDate, 'Next due date');

      if (!payload.accountId) throw new AppError('Account is required', 400);
      if (!payload.categoryId) throw new AppError('Category is required', 400);

      const [accountRows, categoryRows] = await Promise.all([
        db.select('SELECT id FROM "Account" WHERE id = ? AND userId = ?', [payload.accountId, userId]),
        db.select(
          "SELECT id FROM \"Category\" WHERE id = ? AND userId = ? AND type = 'EXPENSE'",
          [payload.categoryId, userId]
        )
      ]);

      if (accountRows.length === 0) {
        throw new AppError('Account not found or does not belong to you', 400);
      }
      if (categoryRows.length === 0) {
        throw new AppError(
          'Category not found, does not belong to you, or is not an EXPENSE category',
          400
        );
      }

      const id = makeId();
      const timestamp = now();
      await db.execute(
        `INSERT INTO "RecurringExpense"
           (id, name, amount, frequency, "nextDueDate", description, "isActive", userId, accountId, categoryId, "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          amount,
          frequency,
          nextDueDate,
          payload.description ? String(payload.description).trim() : null,
          payload.isActive === undefined ? 1 : payload.isActive ? 1 : 0,
          userId,
          payload.accountId,
          payload.categoryId,
          timestamp,
          timestamp
        ]
      );

      return this.getRecurringExpense(userId, id);
    },

    async updateRecurringExpense(userId, id, payload) {
      const existing = await findOwned(userId, id);
      const timestamp = now();

      const accountId = payload.accountId ?? existing.accountId;
      const categoryId = payload.categoryId ?? existing.categoryId;
      if (payload.accountId !== undefined || payload.categoryId !== undefined) {
        const [accountRows, categoryRows] = await Promise.all([
          db.select('SELECT id FROM "Account" WHERE id = ? AND userId = ?', [accountId, userId]),
          db.select(
            "SELECT id FROM \"Category\" WHERE id = ? AND userId = ? AND type = 'EXPENSE'",
            [categoryId, userId]
          )
        ]);
        if (accountRows.length === 0) {
          throw new AppError('Account not found or does not belong to you', 400);
        }
        if (categoryRows.length === 0) {
          throw new AppError(
            'Category not found, does not belong to you, or is not an EXPENSE category',
            400
          );
        }
      }

      await db.execute(
        `UPDATE "RecurringExpense" SET
           name = ?, amount = ?, frequency = ?, "nextDueDate" = ?, description = ?,
           "isActive" = ?, accountId = ?, categoryId = ?, "updatedAt" = ?
         WHERE id = ? AND userId = ?`,
        [
          payload.name === undefined ? existing.name : String(payload.name).trim(),
          payload.amount === undefined ? existing.amount : assertPositive(payload.amount, 'Amount'),
          payload.frequency === undefined ? existing.frequency : assertFrequency(payload.frequency),
          payload.nextDueDate === undefined
            ? existing.nextDueDate
            : parseDate(payload.nextDueDate, 'Next due date'),
          payload.description === undefined
            ? existing.description
            : payload.description
              ? String(payload.description).trim()
              : null,
          payload.isActive === undefined ? existing.isActive : payload.isActive ? 1 : 0,
          accountId,
          categoryId,
          timestamp,
          id,
          userId
        ]
      );

      return this.getRecurringExpense(userId, id);
    },

    async deleteRecurringExpense(userId, id) {
      const existing = await findOwned(userId, id);
      await db.execute('DELETE FROM "RecurringExpense" WHERE id = ? AND userId = ?', [id, userId]);
      return { id: existing.id };
    },

    /** Totals for ACTIVE recurring expenses only. */
    async getSummary(userId, { days = 30 } = {}) {
      const window = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
      const horizon = new Date(startOfToday().getTime() + window * 24 * 60 * 60 * 1000);

      const [activeRows, upcomingRows, nextRow, pausedCount] = await Promise.all([
        db.select(
          'SELECT id, amount, frequency FROM "RecurringExpense" WHERE userId = ? AND "isActive" = 1',
          [userId]
        ),
        db.select(
          'SELECT COUNT(*) AS c FROM "RecurringExpense" WHERE userId = ? AND "isActive" = 1 AND "nextDueDate" <= ?',
          [userId, horizon.toISOString()]
        ),
        db.select(
          'SELECT id, name, amount, "nextDueDate" FROM "RecurringExpense" WHERE userId = ? AND "isActive" = 1 ORDER BY "nextDueDate" ASC LIMIT 1',
          [userId]
        ),
        db.select(
          'SELECT COUNT(*) AS c FROM "RecurringExpense" WHERE userId = ? AND "isActive" = 0',
          [userId]
        )
      ]);

      const totals = summarize(activeRows);

      return {
        ...totals,
        pausedCount: Number(pausedCount[0]?.c ?? 0),
        upcomingCount: Number(upcomingRows[0]?.c ?? 0),
        windowDays: window,
        nextPayment: nextRow.length
          ? {
              id: nextRow[0].id,
              name: nextRow[0].name,
              amount: fromMinorUnits(nextRow[0].amount),
              nextDueDate: nextRow[0].nextDueDate,
              daysUntilDue: daysUntil(nextRow[0].nextDueDate)
            }
          : null
      };
    },

    /** Upcoming payments: ACTIVE only, ordered by nextDueDate ASC. */
    async getUpcoming(userId, { days = 30, limit = 20 } = {}) {
      const window = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
      const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const horizon = new Date(startOfToday().getTime() + window * 24 * 60 * 60 * 1000);

      const rows = await db.select(
        `SELECT r.*, a.name AS accountName, a.currency AS accountCurrency,
                c.name AS categoryName, c.type AS categoryType
         FROM "RecurringExpense" r
         LEFT JOIN "Account" a ON a.id = r.accountId
         LEFT JOIN "Category" c ON c.id = r.categoryId
         WHERE r.userId = ? AND r."isActive" = 1 AND r."nextDueDate" <= ?
         ORDER BY r."nextDueDate" ASC LIMIT ?`,
        [userId, horizon.toISOString(), take]
      );

      return {
        windowDays: window,
        upcoming: rows.map((row) => serializeRecurringExpense({
          ...row,
          account: row.accountName
            ? { id: row.accountId, name: row.accountName, currency: row.accountCurrency ?? 'INR' }
            : undefined,
          category: row.categoryName
            ? { id: row.categoryId, name: row.categoryName, type: row.categoryType }
            : undefined
        }))
      };
    },

    /** Dashboard aggregation: narrow reads, never touches transactions. */
    async getRecurringSummary(userId, { days = 30 } = {}) {
      const window = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
      const horizon = new Date(startOfToday().getTime() + window * 24 * 60 * 60 * 1000);

      const [rows, upcomingCount, next] = await Promise.all([
        db.select(
          'SELECT id, amount, frequency FROM "RecurringExpense" WHERE userId = ? AND "isActive" = 1',
          [userId]
        ),
        db.select(
          'SELECT COUNT(*) AS c FROM "RecurringExpense" WHERE userId = ? AND "isActive" = 1 AND "nextDueDate" <= ?',
          [userId, horizon.toISOString()]
        ),
        db.select(
          'SELECT "nextDueDate" FROM "RecurringExpense" WHERE userId = ? AND "isActive" = 1 ORDER BY "nextDueDate" ASC LIMIT 1',
          [userId]
        )
      ]);

      return {
        ...summarize(rows),
        upcomingCount: Number(upcomingCount[0]?.c ?? 0),
        nextDueDate: next[0]?.nextDueDate ?? null
      };
    },

    /**
     * Process every active recurring expense that is due.
     *
     * @param {string} userId always the local user, never a request param
     */
    async processDueRecurringTransactions(userId, options = {}) {
      const asOfDay = options.asOfDate
        ? toUtcDay(parseIsoDay(options.asOfDate, 'asOfDate'))
        : toUtcDay(new Date());
      const maxCatchUp = assertIntInRange(
        options.maxCatchUp,
        'maxCatchUp',
        DEFAULT_MAX_CATCH_UP,
        1,
        MAX_CATCH_UP_LIMIT
      );
      const dryRun = Boolean(options.dryRun);

      const dueItems = await db.select(
        `SELECT id, name, amount, frequency, "nextDueDate", accountId, categoryId
         FROM "RecurringExpense"
         WHERE userId = ? AND "isActive" = 1 AND "nextDueDate" < ?
         ORDER BY "nextDueDate" ASC`,
        [userId, addUtcDays(asOfDay, 1).toISOString()]
      );

      const summary = {
        asOfDate: dayString(asOfDay),
        dryRun,
        maxCatchUp,
        itemsDue: dueItems.length,
        created: 0,
        failed: 0,
        skipped: 0,
        capped: false,
        results: []
      };

      for (const item of dueItems) {
        const anchor = toUtcDay(new Date(item.nextDueDate));

        // The log remembers the original day-of-month.
        const earliest = await db.select(
          'SELECT "dueDate" FROM "RecurringOccurrence" WHERE "recurringExpenseId" = ? ORDER BY "dueDate" ASC LIMIT 1',
          [item.id]
        );
        const anchorDay = resolveAnchorDay(
          anchor,
          earliest.length ? new Date(earliest[0].dueDate).getUTCDate() : null
        );

        const dueDates = enumerateDueDates(anchor, item.frequency, anchorDay, asOfDay, maxCatchUp);
        const itemResult = {
          id: item.id,
          name: item.name,
          frequency: item.frequency,
          anchor: dayString(anchor),
          occurrences: [],
          failureRecorded: false
        };

        for (let index = 0; index < dueDates.length; index += 1) {
          const dueDate = dueDates[index];
          const nextDueDate = stepDue(anchor, index + 1, item.frequency, anchorDay);
          let outcome;
          const detail = {};

          // Idempotency lookup first: the same date must never charge twice.
          const already = await db.select(
            'SELECT status, "transactionId" FROM "RecurringOccurrence" WHERE "recurringExpenseId" = ? AND "dueDate" = ?',
            [item.id, dueDate.toISOString()]
          );

          if (already.length > 0 && already[0].status === 'CREATED') {
            outcome = dryRun ? 'would-skip' : 'skipped';
            detail.reason = 'Occurrence already processed';
            detail.transactionId = already[0].transactionId;
            if (!dryRun && new Date(item.nextDueDate).getTime() <= dueDate.getTime()) {
              await db.execute(
                'UPDATE "RecurringExpense" SET "nextDueDate" = ?, "updatedAt" = ? WHERE id = ? AND userId = ?',
                [nextDueDate.toISOString(), now(), item.id, userId]
              );
              detail.repaired = true;
            }
          } else if (dryRun) {
            const preview = await previewOccurrence(userId, item);
            outcome = preview.outcome;
            if (preview.reason) detail.reason = preview.reason;
          } else {
            try {
              const created = await createOccurrence(userId, item, dueDate.toISOString(), nextDueDate.toISOString());
              outcome = 'created';
              detail.transactionId = created.transactionId;
              detail.nextDueDate = dayString(created.nextDueDate);
            } catch (error) {
              if (error?.skip) {
                outcome = 'skipped';
                detail.reason = error.message;
              } else if (/UNIQUE constraint/i.test(error?.message ?? '')) {
                // Lost a race with another processor run — exactly the
                // outcome idempotency is supposed to produce.
                outcome = 'skipped';
                detail.reason = 'Occurrence already processed by another run';
              } else {
                outcome = 'failed';
                detail.reason = String(error?.message ?? 'Unknown error').slice(0, 500);
                await recordFailure(item.id, userId, dueDate.toISOString(), detail.reason);
                itemResult.failureRecorded = true;
              }
            }
          }

          itemResult.occurrences.push({ dueDate: dayString(dueDate), outcome, ...detail });

          if (outcome === 'created' || outcome === 'would-create') summary.created += 1;
          else if (outcome === 'failed' || outcome === 'would-fail') summary.failed += 1;
          else summary.skipped += 1;

          // A failed occurrence stays due: stop here, do not skip ahead.
          if (outcome === 'failed') break;
        }

        // Still due after this run? => the maxCatchUp cap stopped us early.
        const nextCandidate = stepDue(anchor, dueDates.length, item.frequency, anchorDay);
        if (!itemResult.failureRecorded && nextCandidate.getTime() <= asOfDay.getTime()) {
          itemResult.moreDue = true;
          summary.capped = true;
        }

        const stored = await db.select('SELECT "nextDueDate" FROM "RecurringExpense" WHERE id = ?', [item.id]);
        itemResult.nextDueDate = stored[0]?.nextDueDate ?? null;

        delete itemResult.failureRecorded;
        summary.results.push(itemResult);
      }

      return summary;
    },

    /** Occurrence / failure history for one item. */
    async listOccurrences(userId, recurringExpenseId, options = {}) {
      const item = await db.select(
        'SELECT id FROM "RecurringExpense" WHERE id = ? AND userId = ?',
        [recurringExpenseId, userId]
      );
      if (item.length === 0) throw new AppError('Recurring expense not found', 404);

      const take = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);

      const rows = await db.select(
        `SELECT id, "dueDate", status, "transactionId", "failureReason", "attemptCount", "createdAt", "updatedAt"
         FROM "RecurringOccurrence" WHERE "recurringExpenseId" = ? AND userId = ?
         ORDER BY "dueDate" DESC LIMIT ?`,
        [recurringExpenseId, userId, take]
      );

      return { occurrences: rows, count: rows.length };
    }
  };
};

const startOfToday = () => {
  const nowDate = new Date();
  return new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
};

export default createRecurringExpenseService;
