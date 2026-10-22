/**
 * LOCAL BUDGET SERVICE (Android conversion — Phase C)
 * ==================================================
 * The on-device counterpart of `server/src/services/budgetService.js`.
 *
 * The status rules (ON_TRACK / WARNING / EXCEEDED) come from
 * `shared/budgetCalculator.js`, so the device and the server can never
 * disagree about a budget.
 *
 * `spent` is NOT a stored counter: it is always recomputed from the
 * transaction history for the budget's month, which is why a deleted
 * transaction can never leave a stale amount behind.
 */

import { AppError } from '@shared/AppError.js';
import { toMinorUnits, fromMinorUnits } from '@shared/money.js';
import { monthRange, monthLabel } from '@shared/dateRange.js';
import { round2 } from '@shared/goalCalculator.js';
import {
  BUDGET_STATUS_THRESHOLDS,
  resolveBudgetStatus,
  computeBudgetStatus
} from '@shared/budgetCalculator.js';
import { makeId } from '../schema.js';

export { BUDGET_STATUS_THRESHOLDS, resolveBudgetStatus, computeBudgetStatus };

const now = () => new Date().toISOString();

/** Budgets whose category was deleted arrive as `null` (onDelete: SetNull). */
const serializeCategory = (category) =>
  category
    ? { id: category.id, name: category.name, icon: category.icon, color: category.color }
    : { id: null, name: 'Uncategorized', icon: null, color: null };

const serializeBudget = (budget, status) => ({
  id: budget.id,
  category: serializeCategory(budget.category),
  budgetAmount: fromMinorUnits(budget.amount),
  ...status
});

/**
 * Spent totals for MANY budgets using ONE aggregate per distinct month
 * (never one query per budget).
 */
const calculateBudgetStatusBulk = async (db, userId, budgets) => {
  if (budgets.length === 0) return [];

  const byMonth = new Map();
  for (const budget of budgets) {
    const key = `${budget.year}-${budget.month}`;
    if (!byMonth.has(key)) byMonth.set(key, { year: budget.year, month: budget.month, group: [] });
    byMonth.get(key).group.push(budget);
  }

  const statusById = new Map();

  await Promise.all(
    [...byMonth.values()].map(async ({ year, month, group }) => {
      const { start, end } = monthRange(year, month);

      const rows = await db.select(
        `SELECT categoryId, SUM(amount) AS total FROM "Transaction"
         WHERE userId = ? AND type = 'EXPENSE' AND date >= ? AND date < ?
         GROUP BY categoryId`,
        [userId, start.toISOString(), end.toISOString()]
      );

      const spentByCategory = new Map(
        rows.map((row) => [row.categoryId, Number(row.total ?? 0)])
      );

      for (const budget of group) {
        statusById.set(
          budget.id,
          computeBudgetStatus(budget.amount, spentByCategory.get(budget.categoryId) ?? 0)
        );
      }
    })
  );

  return budgets.map((budget) => statusById.get(budget.id));
};

/** Single-budget variant, kept for the detail endpoints. */
const calculateBudgetStatus = async (db, userId, categoryId, month, year) => {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const { start, end } = monthRange(numericYear, numericMonth);

  const [budgetRows, aggregateRows] = await Promise.all([
    db.select(
      'SELECT id, amount FROM "Budget" WHERE userId = ? AND categoryId = ? AND month = ? AND year = ?',
      [userId, categoryId, numericMonth, numericYear]
    ),
    db.select(
      `SELECT SUM(amount) AS total FROM "Transaction"
       WHERE userId = ? AND type = 'EXPENSE' AND categoryId = ? AND date >= ? AND date < ?`,
      [userId, categoryId, start.toISOString(), end.toISOString()]
    )
  ]);

  const spentAmount = Number(aggregateRows[0]?.total ?? 0);

  if (budgetRows.length === 0) {
    return {
      budgetAmount: 0,
      spentAmount: round2(fromMinorUnits(spentAmount)),
      remainingAmount: 0,
      percentageUsed: 0,
      status: 'NO_BUDGET'
    };
  }

  return computeBudgetStatus(budgetRows[0].amount, spentAmount);
};

export const createBudgetService = (db) => ({
  async getBudgets(userId, { month, year } = {}) {
    const clauses = ['b.userId = ?'];
    const params = [userId];

    if (month && year) {
      clauses.push('b.month = ? AND b.year = ?');
      params.push(Number(month), Number(year));
    }

    const budgets = await db.select(
      `SELECT b.*, c.id AS cId, c.name AS cName, c.icon AS cIcon, c.color AS cColor
       FROM "Budget" b
       LEFT JOIN "Category" c ON c.id = b.categoryId
       WHERE ${clauses.join(' AND ')}
       ORDER BY b.month DESC, b.year DESC`,
      params
    );

    const withCategory = budgets.map((budget) => ({
      ...budget,
      category: budget.cId
        ? { id: budget.cId, name: budget.cName, icon: budget.cIcon, color: budget.cColor }
        : null
    }));

    const statuses = await calculateBudgetStatusBulk(db, userId, withCategory);
    return withCategory.map((budget, index) => serializeBudget(budget, statuses[index]));
  },

  async getBudgetOverview(userId, { month, year }) {
    const numericMonth = Number(month);
    const numericYear = Number(year);

    if (
      !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12 ||
      !Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2999
    ) {
      throw new AppError('A valid month and year is required', 400);
    }

    const budgets = await db.select(
      `SELECT b.*, c.id AS cId, c.name AS cName, c.icon AS cIcon, c.color AS cColor
       FROM "Budget" b
       LEFT JOIN "Category" c ON c.id = b.categoryId
       WHERE b.userId = ? AND b.month = ? AND b.year = ?
       ORDER BY b.amount DESC`,
      [userId, numericMonth, numericYear]
    );

    const withCategory = budgets.map((budget) => ({
      ...budget,
      category: budget.cId
        ? { id: budget.cId, name: budget.cName, icon: budget.cIcon, color: budget.cColor }
        : null
    }));

    const statuses = await calculateBudgetStatusBulk(db, userId, withCategory);
    const items = withCategory.map((budget, index) => serializeBudget(budget, statuses[index]));

    const totalBudget = round2(items.reduce((sum, item) => sum + item.budgetAmount, 0));
    const totalSpent = round2(items.reduce((sum, item) => sum + item.spentAmount, 0));
    const remainingAmount = round2(totalBudget - totalSpent);
    const usagePercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 10000) / 100 : 0;

    const alerts = items
      .filter((item) => item.status === 'WARNING' || item.status === 'EXCEEDED')
      .map((item) => ({
        budgetId: item.id,
        category: item.category,
        status: item.status,
        spentAmount: item.spentAmount,
        budgetAmount: item.budgetAmount,
        remainingAmount: item.remainingAmount,
        percentageUsed: item.percentageUsed
      }));

    return {
      month: numericMonth,
      year: numericYear,
      monthLabel: monthLabel(numericYear, numericMonth),
      budgetCount: items.length,
      budgets: items,
      alerts,
      totals: {
        totalBudget,
        totalSpent,
        remainingAmount,
        usagePercent,
        status: items.length ? resolveBudgetStatus(usagePercent) : 'NO_BUDGET',
        exceededCount: items.filter((item) => item.status === 'EXCEEDED').length,
        warningCount: items.filter((item) => item.status === 'WARNING').length
      }
    };
  },

  async getBudgetById(userId, budgetId) {
    const rows = await db.select(
      `SELECT b.*, c.id AS cId, c.name AS cName, c.icon AS cIcon, c.color AS cColor
       FROM "Budget" b
       LEFT JOIN "Category" c ON c.id = b.categoryId
       WHERE b.id = ? AND b.userId = ?`,
      [budgetId, userId]
    );
    if (rows.length === 0) throw new AppError('Budget not found', 404);

    const budget = rows[0];
    const status = await calculateBudgetStatus(
      db,
      userId,
      budget.categoryId,
      budget.month,
      budget.year
    );

    return serializeBudget(
      {
        ...budget,
        category: budget.cId
          ? { id: budget.cId, name: budget.cName, icon: budget.cIcon, color: budget.cColor }
          : null
      },
      status
    );
  },

  async createBudget(userId, data) {
    const { categoryId, amount, month, year, name } = data;

    const categoryRows = await db.select(
      "SELECT id, name FROM \"Category\" WHERE id = ? AND userId = ? AND type = 'EXPENSE'",
      [categoryId, userId]
    );
    if (categoryRows.length === 0) {
      throw new AppError(
        'Category not found or does not belong to user or is not an EXPENSE category',
        400
      );
    }

    const id = makeId();
    const timestamp = now();

    try {
      await db.execute(
        `INSERT INTO "Budget" (id, name, amount, spent, month, year, userId, categoryId, "createdAt", "updatedAt")
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name || `${categoryRows[0].name} budget`,
          toMinorUnits(amount),
          Number(month),
          Number(year),
          userId,
          categoryId,
          timestamp,
          timestamp
        ]
      );
    } catch (error) {
      if (error?.code === 'P2002' || /UNIQUE constraint/i.test(error?.message ?? '')) {
        throw new AppError(
          'A budget already exists for this category, month, and year',
          400
        );
      }
      throw error;
    }

    return this.getBudgetById(userId, id);
  },

  async updateBudget(userId, budgetId, data) {
    const existing = await db.select('SELECT * FROM "Budget" WHERE id = ? AND userId = ?', [
      budgetId,
      userId
    ]);
    if (existing.length === 0) throw new AppError('Budget not found', 404);

    const current = existing[0];
    const timestamp = now();

    await db.execute(
      `UPDATE "Budget" SET
         amount = ?, month = ?, year = ?, "updatedAt" = ?
       WHERE id = ? AND userId = ?`,
      [
        data.amount === undefined ? current.amount : toMinorUnits(data.amount),
        data.month === undefined ? current.month : Number(data.month),
        data.year === undefined ? current.year : Number(data.year),
        timestamp,
        budgetId,
        userId
      ]
    );

    return this.getBudgetById(userId, budgetId);
  },

  async deleteBudget(userId, budgetId) {
    const existing = await db.select('SELECT id FROM "Budget" WHERE id = ? AND userId = ?', [
      budgetId,
      userId
    ]);
    if (existing.length === 0) throw new AppError('Budget not found', 404);

    await db.execute('DELETE FROM "Budget" WHERE id = ? AND userId = ?', [budgetId, userId]);
    return { success: true };
  }
});

export default createBudgetService;
