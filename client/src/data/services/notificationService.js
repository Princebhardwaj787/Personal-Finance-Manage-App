/**
 * LOCAL NOTIFICATION SERVICE (Android conversion — Phase C)
 * ========================================================
 * The on-device counterpart of `server/src/services/notificationService.js`.
 *
 * Idempotency is preserved: `create` takes a `dedupeKey` and the unique
 * (userId, dedupeKey) index makes a second create with the same key a no-op
 * instead of a duplicate.
 *
 * Preferences gate creation the same way they do on the server.
 */

import { AppError } from '@shared/AppError.js';
import { fromMinorUnits } from '@shared/money.js';
import { toUtcDay } from '@shared/dateRange.js';
import { makeId } from '../schema.js';

export const NOTIFICATION_TYPES = [
  'BUDGET_WARNING',
  'BUDGET_EXCEEDED',
  'UPCOMING_PAYMENT',
  'PAYMENT_PROCESSED',
  'PAYMENT_FAILED',
  'GOAL_COMPLETED',
  'GOAL_DEADLINE',
  'LOW_BALANCE',
  'SYSTEM'
];

export const NOTIFICATION_PRIORITIES = ['INFO', 'WARNING', 'IMPORTANT'];

export const DEFAULT_PREFERENCES = {
  budgetAlerts: true,
  upcomingPayments: true,
  paymentProcessing: true,
  savingsGoals: true,
  lowBalance: true
};

const PREFERENCE_BY_TYPE = {
  BUDGET_WARNING: 'budgetAlerts',
  BUDGET_EXCEEDED: 'budgetAlerts',
  UPCOMING_PAYMENT: 'upcomingPayments',
  PAYMENT_PROCESSED: 'paymentProcessing',
  PAYMENT_FAILED: 'paymentProcessing',
  GOAL_COMPLETED: 'savingsGoals',
  GOAL_DEADLINE: 'savingsGoals',
  LOW_BALANCE: 'lowBalance'
};

const now = () => new Date().toISOString();
const dayString = (date) => date.toISOString().slice(0, 10);

const serializeNotification = (row) => ({
  id: row.id,
  userId: row.userId,
  type: row.type,
  priority: row.priority,
  title: row.title,
  message: row.message,
  isRead: Boolean(row.isRead),
  readAt: row.readAt ?? null,
  metadata: row.metadata ? JSON.parse(row.metadata) : null,
  dedupeKey: row.dedupeKey ?? null,
  createdAt: row.createdAt
});

export const createNotificationService = (db) => {
  const getPreferences = async (userId) => {
    const rows = await db.select('SELECT * FROM "NotificationPreference" WHERE userId = ?', [userId]);
    if (rows.length === 0) return { ...DEFAULT_PREFERENCES };
    return {
      budgetAlerts: Boolean(rows[0].budgetAlerts),
      upcomingPayments: Boolean(rows[0].upcomingPayments),
      paymentProcessing: Boolean(rows[0].paymentProcessing),
      savingsGoals: Boolean(rows[0].savingsGoals),
      lowBalance: Boolean(rows[0].lowBalance)
    };
  };

  const create = async (userId, payload) => {
    const type = payload.type;
    if (!NOTIFICATION_TYPES.includes(type)) {
      throw new AppError(`type must be one of: ${NOTIFICATION_TYPES.join(', ')}`, 400);
    }
    const priority = payload.priority || 'INFO';
    if (!NOTIFICATION_PRIORITIES.includes(priority)) {
      throw new AppError(`priority must be one of: ${NOTIFICATION_PRIORITIES.join(', ')}`, 400);
    }

    const title = String(payload.title ?? '').trim();
    const message = String(payload.message ?? '').trim();
    if (!title) throw new AppError('title is required', 400);
    if (!message) throw new AppError('message is required', 400);

    // SYSTEM notifications are never toggleable; everything else is gated.
    const preferenceKey = PREFERENCE_BY_TYPE[type];
    if (preferenceKey) {
      const preferences = await getPreferences(userId);
      if (!preferences[preferenceKey]) return null;
    }

    const dedupeKey = payload.dedupeKey ? String(payload.dedupeKey) : null;
    const id = makeId();

    try {
      await db.execute(
        'INSERT INTO "Notification" (id, userId, type, priority, title, message, "isRead", metadata, "dedupeKey", "createdAt") VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        [
          id,
          userId,
          type,
          priority,
          title,
          message,
          payload.metadata ? JSON.stringify(payload.metadata) : null,
          dedupeKey,
          now()
        ]
      );
    } catch (error) {
      // The unique (userId, dedupeKey) index rejected a duplicate — that is
      // the idempotency contract working, not an error.
      if (/UNIQUE constraint/i.test(error?.message ?? '')) return null;
      throw error;
    }

    const created = await db.select('SELECT * FROM "Notification" WHERE id = ?', [id]);
    return serializeNotification(created[0]);
  };

  return {
    NOTIFICATION_TYPES,
    DEFAULT_PREFERENCES,
    create,
    getPreferences,

    async list(userId, { page = 1, limit = 20, types } = {}) {
      const safePage = Math.max(parseInt(page, 10) || 1, 1);
      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

      const clauses = ['userId = ?'];
      const params = [userId];

      if (types) {
        const list = String(types).split(',').map((t) => t.trim()).filter(Boolean);
        const invalid = list.filter((t) => !NOTIFICATION_TYPES.includes(t));
        if (invalid.length > 0) {
          throw new AppError(`Invalid notification types: ${invalid.join(', ')}`, 400);
        }
        if (list.length > 0) {
          clauses.push(`type IN (${list.map(() => '?').join(',')})`);
          params.push(...list);
        }
      }

      const where = clauses.join(' AND ');
      const rows = await db.select(
        `SELECT * FROM "Notification" WHERE ${where} ORDER BY "createdAt" DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, safeLimit, (safePage - 1) * safeLimit]
      );
      const totalRows = await db.select(
        `SELECT COUNT(*) AS c FROM "Notification" WHERE ${where}`,
        params
      );
      const total = Number(totalRows[0]?.c ?? 0);

      return {
        notifications: rows.map(serializeNotification),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit) || 1
        }
      };
    },

    async getUnreadCount(userId) {
      const rows = await db.select(
        'SELECT COUNT(*) AS c FROM "Notification" WHERE userId = ? AND "isRead" = 0',
        [userId]
      );
      return { unreadCount: Number(rows[0]?.c ?? 0) };
    },

    async markRead(userId, notificationId) {
      const existing = await db.select(
        'SELECT * FROM "Notification" WHERE id = ? AND userId = ?',
        [notificationId, userId]
      );
      if (existing.length === 0) throw new AppError('Notification not found', 404);

      await db.execute(
        'UPDATE "Notification" SET "isRead" = 1, "readAt" = ? WHERE id = ? AND userId = ?',
        [now(), notificationId, userId]
      );
      const rows = await db.select('SELECT * FROM "Notification" WHERE id = ?', [notificationId]);
      return serializeNotification(rows[0]);
    },

    async markAllRead(userId) {
      const result = await db.execute(
        'UPDATE "Notification" SET "isRead" = 1, "readAt" = ? WHERE userId = ? AND "isRead" = 0',
        [now(), userId]
      );
      return { updated: result.rowsAffected };
    },

    async remove(userId, notificationId) {
      const existing = await db.select(
        'SELECT id FROM "Notification" WHERE id = ? AND userId = ?',
        [notificationId, userId]
      );
      if (existing.length === 0) throw new AppError('Notification not found', 404);

      await db.execute('DELETE FROM "Notification" WHERE id = ? AND userId = ?', [
        notificationId,
        userId
      ]);
      return { id: existing[0].id, deleted: true };
    },

    async updatePreferences(userId, payload = {}) {
      const allowed = Object.keys(DEFAULT_PREFERENCES);
      const data = {};
      for (const key of allowed) {
        if (payload[key] !== undefined) {
          if (typeof payload[key] !== 'boolean') {
            throw new AppError(`${key} must be a boolean`, 400);
          }
          data[key] = payload[key] ? 1 : 0;
        }
      }

      const existing = await db.select(
        'SELECT id FROM "NotificationPreference" WHERE userId = ?',
        [userId]
      );

      if (existing.length === 0) {
        await db.execute(
          `INSERT INTO "NotificationPreference" (id, userId, "budgetAlerts", "upcomingPayments", "paymentProcessing", "savingsGoals", "lowBalance", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            makeId(),
            userId,
            data.budgetAlerts ?? 1,
            data.upcomingPayments ?? 1,
            data.paymentProcessing ?? 1,
            data.savingsGoals ?? 1,
            data.lowBalance ?? 1,
            now(),
            now()
          ]
        );
      } else if (Object.keys(data).length > 0) {
        const assignments = Object.keys(data).map((key) => `"${key}" = ?`).join(', ');
        await db.execute(
          `UPDATE "NotificationPreference" SET ${assignments}, "updatedAt" = ? WHERE userId = ?`,
          [...Object.values(data), now(), userId]
        );
      }

      return getPreferences(userId);
    },

    /**
     * Run the scheduled checks for one user. Every creation path is deduped,
     * so a second run in the same period creates nothing.
     */
    async processScheduled(userId, { budgetService, savingsGoalService, recurringExpenseService } = {}) {
      const totals = { budget: 0, upcomingPayments: 0, goals: 0, lowBalance: 0 };
      const today = toUtcDay(new Date());

      if (budgetService) {
        const overview = await budgetService.getBudgetOverview(userId, {
          month: today.getUTCMonth() + 1,
          year: today.getUTCFullYear()
        });
        const period = `${overview.year}-${String(overview.month).padStart(2, '0')}`;

        for (const budget of overview.budgets) {
          const pct = budget.percentageUsed;
          const exceeded = pct >= 100;
          if (!exceeded && pct < 85) continue;

          const result = await create(userId, {
            type: exceeded ? 'BUDGET_EXCEEDED' : 'BUDGET_WARNING',
            priority: exceeded ? 'IMPORTANT' : 'WARNING',
            title: `${exceeded ? 'Budget exceeded' : 'Budget warning'}: ${budget.category.name}`,
            message: exceeded
              ? `You have spent ${Math.round(pct)}% of your ${budget.category.name} budget for ${overview.monthLabel} (₹${budget.spentAmount} of ₹${budget.budgetAmount}).`
              : `You have used ${Math.round(pct)}% of your ${budget.category.name} budget for ${overview.monthLabel} (₹${budget.spentAmount} of ₹${budget.budgetAmount}).`,
            dedupeKey: `budget:${budget.id}:${period}:${exceeded ? 'EXCEEDED' : 'WARNING'}`,
            metadata: {
              budgetId: budget.id,
              categoryId: budget.category.id,
              categoryName: budget.category.name,
              period,
              percentageUsed: pct,
              spentAmount: budget.spentAmount,
              budgetAmount: budget.budgetAmount
            }
          });
          if (result) totals.budget += 1;
        }
      }

      if (recurringExpenseService) {
        const upcoming = await recurringExpenseService.getUpcoming(userId, { days: 30, limit: 50 });
        for (const item of upcoming.upcoming) {
          const dueDay = toUtcDay(new Date(item.nextDueDate));
          const daysUntil = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
          if (![7, 3, 1].includes(daysUntil)) continue;

          const result = await create(userId, {
            type: 'UPCOMING_PAYMENT',
            priority: 'WARNING',
            title: `Upcoming payment: ${item.name}`,
            message: `Your recurring payment "${item.name}" of ₹${item.amount} is due in ${daysUntil} day${daysUntil === 1 ? '' : 's'} (${dayString(dueDay)}).`,
            dedupeKey: `upcoming:${item.id}:${dayString(dueDay)}:${daysUntil}`,
            metadata: {
              recurringExpenseId: item.id,
              name: item.name,
              amount: item.amount,
              dueDate: dayString(dueDay),
              daysUntil
            }
          });
          if (result) totals.upcomingPayments += 1;
        }
      }

      if (savingsGoalService) {
        const goals = await savingsGoalService.listGoals(userId);
        for (const goal of goals) {
          if (goal.status !== 'COMPLETED') continue;
          const result = await create(userId, {
            type: 'GOAL_COMPLETED',
            priority: 'INFO',
            title: `Goal completed: ${goal.name}`,
            message: `You have reached your target of ₹${goal.targetAmount} for "${goal.name}".`,
            dedupeKey: `goal:${goal.id}:COMPLETED`,
            metadata: {
              goalId: goal.id,
              name: goal.name,
              targetAmount: goal.targetAmount,
              currentAmount: goal.currentAmount
            }
          });
          if (result) totals.goals += 1;
        }
      }

      const accounts = await db.select(
        'SELECT id, name, balance, "lowBalanceThreshold" FROM "Account" WHERE userId = ? AND "lowBalanceThreshold" IS NOT NULL',
        [userId]
      );
      const dayKey = dayString(today);
      for (const account of accounts) {
        if (account.balance > account.lowBalanceThreshold) continue;
        const result = await create(userId, {
          type: 'LOW_BALANCE',
          priority: 'WARNING',
          title: `Low balance: ${account.name}`,
          message: `Your account "${account.name}" balance is ₹${fromMinorUnits(account.balance)}, at or below your threshold of ₹${fromMinorUnits(account.lowBalanceThreshold)}.`,
          dedupeKey: `lowbalance:${account.id}:${dayKey}`,
          metadata: {
            accountId: account.id,
            name: account.name,
            balance: fromMinorUnits(account.balance),
            threshold: fromMinorUnits(account.lowBalanceThreshold),
            date: dayKey
          }
        });
        if (result) totals.lowBalance += 1;
      }

      return { usersProcessed: 1, ...totals };
    }
  };
};

export default createNotificationService;
