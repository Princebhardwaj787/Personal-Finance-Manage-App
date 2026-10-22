/**
 * LOCAL SAVINGS GOAL SERVICE (Android conversion — Phase C)
 * =======================================================
 * The on-device counterpart of `server/src/services/savingsGoalService.js`.
 *
 * The goal status rules come from `shared/goalCalculator.js`, so the device
 * and the server always agree on completion and remaining amount.
 *
 * A contribution updates the goal and writes the contribution row in ONE
 * transaction, and the goal is re-read inside that transaction so two
 * concurrent contributions cannot overfund it.
 */

import { AppError } from '@shared/AppError.js';
import { toMinorUnits, fromMinorUnits } from '@shared/money.js';
import {
  GOAL_STATUS,
  GOAL_STATUSES,
  isGoalComplete,
  resolveGoalStatus,
  serializeGoal,
  calculateRemainingAmount
} from '@shared/goalCalculator.js';
import { makeId } from '../schema.js';

export { GOAL_STATUS, GOAL_STATUSES, isGoalComplete };

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

const assertNonNegative = (value, field) => {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new AppError(`${field} must be a number`, 400);
  if (num < 0) throw new AppError(`${field} must not be negative`, 400);
  return toMinorUnits(num);
};

const assertStatus = (value) => {
  if (!GOAL_STATUSES.includes(value)) {
    throw new AppError(`Status must be one of: ${GOAL_STATUSES.join(', ')}`, 400);
  }
  return value;
};

const GOAL_SELECT = `
  id, name, description, "targetAmount", "currentAmount", "targetDate", status, "accountId",
  "createdAt", "updatedAt"`;

export const createSavingsGoalService = (db) => {
  const findOwned = async (userId, goalId) => {
    const rows = await db.select(
      `SELECT ${GOAL_SELECT} FROM "SavingsGoal" WHERE id = ? AND userId = ?`,
      [goalId, userId]
    );
    if (rows.length === 0) throw new AppError('Savings goal not found', 404);
    return rows[0];
  };

  const withCounts = async (goal) => {
    const counts = await db.select(
      'SELECT COUNT(*) AS c FROM "SavingsContribution" WHERE goalId = ?',
      [goal.id]
    );
    return serializeGoal(goal, { contributionsCount: Number(counts[0]?.c ?? 0) });
  };

  return {
    async listGoals(userId, { status } = {}) {
      const clauses = ['userId = ?'];
      const params = [userId];

      if (status) {
        assertStatus(status);
        clauses.push('status = ?');
        params.push(status);
      }

      const goals = await db.select(
        `SELECT ${GOAL_SELECT} FROM "SavingsGoal" WHERE ${clauses.join(' AND ')}
         ORDER BY status ASC, "targetDate" ASC`,
        params
      );

      return Promise.all(goals.map(withCounts));
    },

    async getGoal(userId, goalId) {
      return withCounts(await findOwned(userId, goalId));
    },

    async createGoal(userId, payload) {
      const name = String(payload.name ?? '').trim();
      if (!name) throw new AppError('Name is required', 400);

      const targetAmount = assertPositive(payload.targetAmount, 'Target amount');
      const currentAmount =
        payload.currentAmount === undefined || payload.currentAmount === null
          ? 0
          : assertNonNegative(payload.currentAmount, 'Current amount');

      if (currentAmount > targetAmount) {
        throw new AppError('Current amount cannot exceed the target amount', 400);
      }

      const targetDate = parseDate(payload.targetDate, 'Target date');

      const id = makeId();
      const timestamp = now();

      // Completion is derived, never accepted directly.
      const status = resolveGoalStatus({
        targetAmount,
        currentAmount,
        status: GOAL_STATUS.ACTIVE
      });

      await db.execute(
        `INSERT INTO "SavingsGoal"
           (id, name, description, "targetAmount", "currentAmount", "targetDate", status, userId, "accountId", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          payload.description ? String(payload.description).trim() : null,
          targetAmount,
          currentAmount,
          targetDate,
          status,
          userId,
          payload.accountId ?? null,
          timestamp,
          timestamp
        ]
      );

      return withCounts(await findOwned(userId, id));
    },

    async updateGoal(userId, goalId, payload) {
      const existing = await findOwned(userId, goalId);

      let targetAmount = existing.targetAmount;
      if (payload.targetAmount !== undefined) {
        targetAmount = assertPositive(payload.targetAmount, 'Target amount');
      }

      if (targetAmount < existing.currentAmount) {
        throw new AppError('Target amount cannot be lower than the amount already saved', 400);
      }

      let status;
      if (payload.status !== undefined) {
        // An explicit user choice wins (manual reopen / archive).
        status = assertStatus(payload.status);
      } else {
        status = resolveGoalStatus({
          ...existing,
          targetAmount,
          status: existing.status
        });
      }

      await db.execute(
        `UPDATE "SavingsGoal" SET
           name = ?, description = ?, "targetAmount" = ?, "targetDate" = ?, status = ?, "updatedAt" = ?
         WHERE id = ? AND userId = ?`,
        [
          payload.name === undefined ? existing.name : String(payload.name).trim(),
          payload.description === undefined
            ? existing.description
            : payload.description
              ? String(payload.description).trim()
              : null,
          targetAmount,
          payload.targetDate === undefined
            ? existing.targetDate
            : parseDate(payload.targetDate, 'Target date'),
          status,
          now(),
          goalId,
          userId
        ]
      );

      return withCounts(await findOwned(userId, goalId));
    },

    async deleteGoal(userId, goalId) {
      const existing = await findOwned(userId, goalId);

      const counts = await db.select(
        'SELECT COUNT(*) AS c FROM "SavingsContribution" WHERE goalId = ?',
        [goalId]
      );

      // Deleting a goal removes only the goal and its contribution history.
      // Savings goals have no relation to Transaction, so financial records
      // can never be removed by deleting a goal.
      await db.execute('DELETE FROM "SavingsGoal" WHERE id = ? AND userId = ?', [goalId, userId]);

      return { id: existing.id, deletedContributions: Number(counts[0]?.c ?? 0) };
    },

    /**
     * Record a contribution and increase the goal's saved amount ATOMICALLY.
     */
    async addContribution(userId, goalId, payload) {
      const amount = assertPositive(payload.amount, 'Amount');
      const note = payload.note ? String(payload.note).trim() : null;
      const date = payload.date ? parseDate(payload.date, 'Contribution date') : now();

      const contributionId = makeId();

      await db.transaction(async (tx) => {
        // Re-read the goal INSIDE the transaction so two concurrent
        // contributions cannot overfund it.
        const goalRows = await tx.select(
          `SELECT ${GOAL_SELECT} FROM "SavingsGoal" WHERE id = ? AND userId = ?`,
          [goalId, userId]
        );
        if (goalRows.length === 0) throw new AppError('Savings goal not found', 404);
        const goal = goalRows[0];

        if (goal.status === GOAL_STATUS.ARCHIVED) {
          throw new AppError('Archived goals cannot receive contributions', 400);
        }

        const remaining = calculateRemainingAmount(goal);
        if (amount > remaining) {
          throw new AppError(
            `Contribution exceeds the remaining amount (₹${fromMinorUnits(remaining)})`,
            400
          );
        }

        await tx.execute(
          `INSERT INTO "SavingsContribution" (id, "goalId", amount, date, note, "createdAt")
           VALUES (?, ?, ?, ?, ?, ?)`,
          [contributionId, goal.id, amount, date, note, now()]
        );

        const nextCurrentAmount = goal.currentAmount + amount;
        const status = resolveGoalStatus({ ...goal, currentAmount: nextCurrentAmount });

        await tx.execute(
          'UPDATE "SavingsGoal" SET "currentAmount" = ?, status = ?, "updatedAt" = ? WHERE id = ? AND userId = ?',
          [nextCurrentAmount, status, now(), goal.id, userId]
        );
      });

      const goal = await findOwned(userId, goalId);
      const contributionRows = await db.select(
        'SELECT id, "goalId", amount, date, note, "createdAt" FROM "SavingsContribution" WHERE id = ?',
        [contributionId]
      );

      return {
        goal: await withCounts(goal),
        contribution: {
          ...contributionRows[0],
          amount: fromMinorUnits(contributionRows[0].amount)
        }
      };
    },

    async listContributions(userId, goalId, { page = 1, limit = 10 } = {}) {
      await findOwned(userId, goalId);

      const safePage = Math.max(parseInt(page, 10) || 1, 1);
      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const rows = await db.select(
        `SELECT id, "goalId", amount, date, note, "createdAt" FROM "SavingsContribution"
         WHERE "goalId" = ? ORDER BY date DESC, "createdAt" DESC LIMIT ? OFFSET ?`,
        [goalId, safeLimit, skip]
      );
      const totalRows = await db.select(
        'SELECT COUNT(*) AS c FROM "SavingsContribution" WHERE "goalId" = ?',
        [goalId]
      );
      const total = Number(totalRows[0]?.c ?? 0);

      return {
        contributions: rows.map((row) => ({
          ...row,
          amount: fromMinorUnits(row.amount)
        })),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit) || 1
        }
      };
    },

    /** Aggregate across every goal of a user — used by the dashboard. */
    async getSavingsSummary(userId) {
      const rows = await db.select(
        'SELECT status, COUNT(*) AS c FROM "SavingsGoal" WHERE userId = ? GROUP BY status',
        [userId]
      );
      const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.c)]));

      const totals = await db.select(
        `SELECT SUM("currentAmount") AS saved, SUM("targetAmount") AS targets
         FROM "SavingsGoal" WHERE userId = ? AND status != ?`,
        [userId, GOAL_STATUS.ARCHIVED]
      );

      return {
        activeCount: counts[GOAL_STATUS.ACTIVE] ?? 0,
        completedCount: counts[GOAL_STATUS.COMPLETED] ?? 0,
        archivedCount: counts[GOAL_STATUS.ARCHIVED] ?? 0,
        totalSaved: fromMinorUnits(Number(totals[0]?.saved ?? 0)),
        totalTargets: fromMinorUnits(Number(totals[0]?.targets ?? 0))
      };
    }
  };
};

export default createSavingsGoalService;
