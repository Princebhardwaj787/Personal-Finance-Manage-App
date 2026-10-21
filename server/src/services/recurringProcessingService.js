import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { createNotification } from './notificationService.js';
import { fromMinorUnits } from '../utils/money.js';
import {
  addUtcDays,
  addUtcMonths,
  daysInUtcMonth,
  toUtcDay,
  utcDay,
  parseIsoDay
} from '../utils/dateRange.js';

/**
 * RECURRING TRANSACTION PROCESSOR (Phase 7 §C)
 * ============================================
 * Turns due recurring expenses into real expense transactions.
 *
 * Idempotency (§18): a `RecurringOccurrence` row keyed by
 * `@@unique([recurringExpenseId, dueDate])` is inserted FIRST, inside the same
 * database transaction that creates the transaction and moves the balance.
 * If the same occurrence is processed twice — a second API call, a retry, a
 * racing scheduler — the unique index rejects it and the run becomes a no-op
 * instead of a second charge.
 *
 * Missed-occurrence policy (§20) — DOCUMENTED AND DELIBERATE:
 *   "Catch up every missed occurrence, oldest first, capped at `maxCatchUp`
 *    (default 12) per item per run."
 *   - every past-due date gets its own transaction, so the ledger matches
 *     money that really left the account;
 *   - the cap stops a long-dormant install flooding the ledger in one run —
 *     whatever is left is picked up by the next run (`moreDue`);
 *   - the due date only advances past occurrences that were successfully
 *     created (§23), so a failed occurrence is never lost: it stays due and is
 *     retried, with the failure recorded on the occurrence log.
 *
 * Trigger (§22): `POST /api/recurring-expenses/process`. The function is
 * exported so a cron/scheduler can call it later without going through HTTP.
 */

export const DEFAULT_MAX_CATCH_UP = 12;
export const MAX_CATCH_UP_LIMIT = 60;
export const OCCURRENCE_STATUS = Object.freeze(['CREATED', 'FAILED']);
export const AUTO_NOTE_PREFIX = 'Auto-generated from recurring payment';

const MONTH_STEP = Object.freeze({ MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 });

/** Control-flow marker: skip quietly (paused/deleted item — not a failure). */
class SkipOccurrence extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipOccurrence';
    this.skip = true;
  }
}

const dayString = (date) => date.toISOString().slice(0, 10);

const serializeOccurrence = (row) => ({
  id: row.id,
  recurringExpenseId: row.recurringExpenseId,
  dueDate: row.dueDate,
  status: row.status,
  transactionId: row.transactionId ?? null,
  failureReason: row.failureReason ?? null,
  attemptCount: row.attemptCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

/**
 * Due date after `n` steps from `anchor`.
 *
 * `anchorDay` re-applies the ORIGINAL day of the month after a clamping step,
 * so a "31st" schedule does not drift to the 28th forever. The original day is
 * remembered by the occurrence log (see `resolveAnchorDay`) — which is exactly
 * why that log exists alongside `nextDueDate`.
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
 * Day-of-month to keep after clamping. Only kicks in when the run anchor was
 * clamped onto the last day of a shorter month AND the log remembers a later
 * day — a deliberate reschedule to a normal date is therefore never overridden.
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

/** The failure record (§23): same unique key, attempt counter increments. */
const recordFailure = async (recurringExpenseId, userId, dueDate, reason) => {
  const existing = await prisma.recurringOccurrence.findUnique({
    where: { recurringExpenseId_dueDate: { recurringExpenseId, dueDate } },
    select: { status: true }
  });
  // Never downgrade a CREATED record — that money already moved.
  if (existing?.status === 'CREATED') return;

  await prisma.recurringOccurrence.upsert({
    where: { recurringExpenseId_dueDate: { recurringExpenseId, dueDate } },
    create: {
      recurringExpenseId,
      userId,
      dueDate,
      status: 'FAILED',
      failureReason: reason,
      attemptCount: 1
    },
    update: { status: 'FAILED', failureReason: reason, attemptCount: { increment: 1 } }
  });
};

const reasonOf = (error) =>
  (error && error.message ? String(error.message) : 'Unknown error').slice(0, 500);

/**
 * Create ONE occurrence atomically: idempotency row → validations → balance
 * debit → transaction → link → advance due date. Everything commits together
 * or nothing does (§13 / §31).
 *
 * @param {Date} nextDueDate schedule value to store once the money moved —
 *                           decided by the caller so the run stays consistent.
 */
const createOccurrence = async (userId, item, dueDate, nextDueDate) => {
  const occurrenceKey = { recurringExpenseId: item.id, dueDate };

  return prisma.$transaction(async (tx) => {
    // 1. Claim the occurrence FIRST — the unique index is the idempotency lock.
    await tx.recurringOccurrence.upsert({
      where: { recurringExpenseId_dueDate: occurrenceKey },
      create: {
        recurringExpenseId: item.id,
        userId,
        dueDate,
        status: 'CREATED',
        attemptCount: 1
      },
      update: { status: 'CREATED', attemptCount: { increment: 1 }, failureReason: null }
    });

    // 2. Re-read the live row: a paused/deleted item is a skip, not a failure.
    const live = await tx.recurringExpense.findFirst({
      where: { id: item.id, userId, isActive: true },
      select: { id: true, name: true, amount: true, accountId: true, categoryId: true }
    });
    if (!live) throw new SkipOccurrence('Recurring expense is paused or no longer exists');

    // 3. Ownership checks (§30): both account and category belong to the caller.
    const account = await tx.account.findFirst({
      where: { id: live.accountId, userId },
      select: { id: true, name: true }
    });
    if (!account) throw new AppError('Account no longer exists for this recurring expense', 400);

    const category = await tx.category.findFirst({
      where: { id: live.categoryId, userId, type: 'EXPENSE' },
      select: { id: true }
    });
    if (!category) {
      throw new AppError('Category no longer exists, is not yours, or is not an EXPENSE category', 400);
    }

    // 4. Debit with the balance condition inside the WHERE clause, so the
    //    affordability check and the debit are a single statement.
    const debited = await tx.account.updateMany({
      where: { id: live.accountId, userId, balance: { gte: live.amount } },
      data: { balance: { decrement: live.amount } }
    });
    if (debited.count === 0) {
      const owned = await tx.account.findFirst({
        where: { id: live.accountId, userId },
        select: { name: true, balance: true }
      });
      throw new AppError(
        `Insufficient balance in ${owned?.name ?? 'account'} (available ${fromMinorUnits(owned?.balance ?? 0)}, needed ${fromMinorUnits(live.amount)})`,
        400
      );
    }

    // 5. The actual money record.
    const transaction = await tx.transaction.create({
      data: {
        type: 'EXPENSE',
        amount: live.amount,
        description: live.description || live.name,
        notes: `${AUTO_NOTE_PREFIX}: ${live.name}`,
        date: dueDate,
        userId,
        accountId: live.accountId,
        categoryId: live.categoryId,
        recurringExpenseId: live.id
      },
      select: { id: true }
    });

    // 6. Point the occurrence at the row it produced.
    await tx.recurringOccurrence.update({
      where: { recurringExpenseId_dueDate: occurrenceKey },
      data: { transactionId: transaction.id, failureReason: null }
    });

    // 7. Advance the schedule only now that the money actually moved (§23).
    await tx.recurringExpense.update({
      where: { id: live.id },
      data: { nextDueDate }
    });

    return { transactionId: transaction.id, nextDueDate };
  });
};

/** Read-only version used by `dryRun` previews. */
const previewOccurrence = async (userId, item) => {
  const [account, category, live] = await Promise.all([
    prisma.account.findFirst({
      where: { id: item.accountId, userId },
      select: { balance: true, name: true }
    }),
    prisma.category.findFirst({
      where: { id: item.categoryId, userId, type: 'EXPENSE' },
      select: { id: true }
    }),
    prisma.recurringExpense.findFirst({
      where: { id: item.id, userId, isActive: true },
      select: { id: true, amount: true }
    })
  ]);

  if (!live) {
    return { outcome: 'would-skip', reason: 'Recurring expense is paused or no longer exists' };
  }
  if (!account) {
    return { outcome: 'would-fail', reason: 'Account no longer exists for this recurring expense' };
  }
  if (!category) {
    return {
      outcome: 'would-fail',
      reason: 'Category no longer exists, is not yours, or is not an EXPENSE category'
    };
  }
  if (account.balance < live.amount) {
    return {
      outcome: 'would-fail',
      reason: `Insufficient balance in ${account.name} (available ${fromMinorUnits(account.balance)}, needed ${fromMinorUnits(live.amount)})`
    };
  }
  return { outcome: 'would-create' };
};

/**
 * Process every active recurring expense that is due for `userId`.
 *
 * @param {string} userId  always the authenticated user, never a request param
 * @param {object} [options]
 * @param {string} [options.asOfDate]   'YYYY-MM-DD' (defaults to today, UTC)
 * @param {number} [options.maxCatchUp] missed occurrences per item per run
 * @param {boolean} [options.dryRun]    report without writing anything
 */
export const processDueRecurringTransactions = async (userId, options = {}) => {
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

  const dueItems = await prisma.recurringExpense.findMany({
    where: { userId, isActive: true, nextDueDate: { lt: addUtcDays(asOfDay, 1) } },
    orderBy: { nextDueDate: 'asc' },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      nextDueDate: true,
      accountId: true,
      categoryId: true
    }
  });

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
    const anchor = toUtcDay(item.nextDueDate);

    // The log remembers the original day-of-month (see resolveAnchorDay).
    const earliest = await prisma.recurringOccurrence.findFirst({
      where: { recurringExpenseId: item.id },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true }
    });
    const anchorDay = resolveAnchorDay(anchor, earliest ? earliest.dueDate.getUTCDate() : null);

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
      const already = await prisma.recurringOccurrence.findUnique({
        where: { recurringExpenseId_dueDate: { recurringExpenseId: item.id, dueDate } },
        select: { status: true, transactionId: true }
      });

      if (already?.status === 'CREATED') {
        // Money already moved for this date — repair a stale schedule instead
        // of charging twice, and never touch the balance again.
        outcome = dryRun ? 'would-skip' : 'skipped';
        detail.reason = 'Occurrence already processed';
        detail.transactionId = already.transactionId;
        if (!dryRun && item.nextDueDate.getTime() <= dueDate.getTime()) {
          // The schedule points at an occurrence that already happened (the
          // user reset nextDueDate). Move past it so the item is not stuck.
          await prisma.recurringExpense.update({ where: { id: item.id }, data: { nextDueDate } });
          detail.repaired = true;
        }
      } else if (dryRun) {
        const preview = await previewOccurrence(userId, item);
        outcome = preview.outcome;
        if (preview.reason) detail.reason = preview.reason;
      } else {
        try {
          const created = await createOccurrence(userId, item, dueDate, nextDueDate);
          outcome = 'created';
          detail.transactionId = created.transactionId;
          detail.nextDueDate = dayString(created.nextDueDate);

          // Phase 9 — payment processed notification (single source per
          // event). Deduped per occurrence, so a re-run never duplicates.
          await createNotification(userId, {
            type: 'PAYMENT_PROCESSED',
            priority: 'INFO',
            title: `Payment processed: ${item.name}`,
            message: `Your recurring payment "${item.name}" of ₹${fromMinorUnits(item.amount)} was processed on ${dayString(dueDate)}.`,
            dedupeKey: `payment:${item.id}:${dayString(dueDate)}:PROCESSED`,
            metadata: {
              recurringExpenseId: item.id,
              name: item.name,
              amount: fromMinorUnits(item.amount),
              dueDate: dayString(dueDate),
              transactionId: created.transactionId
            }
          });
        } catch (error) {
          if (error?.code === 'P2002') {
            // Lost a race with another processor run — exactly the outcome
            // idempotency is supposed to produce.
            outcome = 'skipped';
            detail.reason = 'Occurrence already processed by another run';
          } else if (error?.skip) {
            outcome = 'skipped';
            detail.reason = error.message;
          } else {
            outcome = 'failed';
            detail.reason = reasonOf(error);
            await recordFailure(item.id, userId, dueDate, detail.reason);
            itemResult.failureRecorded = true;

            // Phase 9 — payment failed notification. The message is
            // deliberately generic: internal/DB error details are never
            // exposed to the user (§30). The safe AppError reason is kept
            // in metadata for support purposes only.
            await createNotification(userId, {
              type: 'PAYMENT_FAILED',
              priority: 'IMPORTANT',
              title: `Payment failed: ${item.name}`,
              message: `We couldn't process your recurring payment "${item.name}" of ₹${fromMinorUnits(item.amount)} due on ${dayString(dueDate)}. Please check your account balance and try again.`,
              dedupeKey: `payment:${item.id}:${dayString(dueDate)}:FAILED`,
              metadata: {
                recurringExpenseId: item.id,
                name: item.name,
                amount: fromMinorUnits(item.amount),
                dueDate: dayString(dueDate),
                reason: error instanceof AppError ? detail.reason : 'Processing error'
              }
            });
          }
        }
      }

      itemResult.occurrences.push({ dueDate: dayString(dueDate), outcome, ...detail });

      if (outcome === 'created' || outcome === 'would-create') summary.created += 1;
      else if (outcome === 'failed' || outcome === 'would-fail') summary.failed += 1;
      else summary.skipped += 1;

      // A failed occurrence stays due: stop here, do not skip ahead of it (§23).
      if (outcome === 'failed') break;
    }

    // Still due after this run? => the maxCatchUp cap stopped us early.
    const nextCandidate = stepDue(anchor, dueDates.length, item.frequency, anchorDay);
    if (!itemResult.failureRecorded && nextCandidate.getTime() <= asOfDay.getTime()) {
      itemResult.moreDue = true;
      summary.capped = true;
    }

    const stored = await prisma.recurringExpense.findUnique({
      where: { id: item.id },
      select: { nextDueDate: true }
    });
    itemResult.nextDueDate = stored?.nextDueDate ? stored.nextDueDate.toISOString() : null;

    delete itemResult.failureRecorded;
    summary.results.push(itemResult);
  }

  return summary;
};

/** Occurrence / failure history for one item (Phase 7 §23 visibility). */
export const listOccurrences = async (userId, recurringExpenseId, options = {}) => {
  const item = await prisma.recurringExpense.findFirst({
    where: { id: recurringExpenseId, userId },
    select: { id: true }
  });
  if (!item) throw new AppError('Recurring expense not found', 404);

  const take = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);

  const rows = await prisma.recurringOccurrence.findMany({
    where: { recurringExpenseId: item.id, userId },
    orderBy: [{ dueDate: 'desc' }],
    take,
    select: {
      id: true,
      dueDate: true,
      status: true,
      transactionId: true,
      failureReason: true,
      attemptCount: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return { occurrences: rows.map(serializeOccurrence), count: rows.length };
};
