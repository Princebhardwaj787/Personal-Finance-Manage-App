import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getBudgetOverview } from './budgetService.js';
import { GOAL_STATUS } from '../utils/goalCalculator.js';
import { toUtcDay } from '../utils/dateRange.js';

/** Local helper: Date -> 'YYYY-MM-DD' (UTC), matching recurringProcessingService. */
const dayString = (date) => date.toISOString().slice(0, 10);

/**
 * NOTIFICATION SERVICE (Phase 9)
 * ===============================
 * Single source for every in-app notification: CRUD, preferences, and the
 * business-specific creation paths (budget, payment, goal, low balance).
 *
 * Idempotency: `createNotification` takes a `dedupeKey`. The unique
 * (userId, dedupeKey) index makes a second create with the same key a
 * no-op, so the scheduled processor can run as often as it likes without
 * producing duplicates. Rows with a NULL dedupeKey are never deduped.
 *
 * Preferences: each create path checks the matching toggle first — a
 * disabled category blocks creation entirely (§31).
 */

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

/** Budget alert thresholds — the notification copy fires at 85%, not at the
 *  80% where the budget status badge turns yellow (§30). */
export const BUDGET_ALERT_THRESHOLDS = { WARNING: 85, EXCEEDED: 100 };

/** Days-before-due milestones for upcoming payment reminders. */
export const UPCOMING_PAYMENT_MILESTONES = [7, 3, 1];

/** Days within which a savings goal deadline reminder is sent. */
export const GOAL_DEADLINE_WINDOW_DAYS = 7;

const assertType = (type) => {
  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new AppError(`type must be one of: ${NOTIFICATION_TYPES.join(', ')}`, 400);
  }
  return type;
};

const assertPriority = (priority) => {
  if (!NOTIFICATION_PRIORITIES.includes(priority)) {
    throw new AppError(`priority must be one of: ${NOTIFICATION_PRIORITIES.join(', ')}`, 400);
  }
  return priority;
};

const serializeMetadata = (metadata) =>
  metadata === undefined || metadata === null ? null : JSON.stringify(metadata);

const parseMetadata = (row) => {
  if (!row.metadata) return null;
  try {
    return JSON.parse(row.metadata);
  } catch {
    return null;
  }
};

const serializeNotification = (row) => ({
  id: row.id,
  userId: row.userId,
  type: row.type,
  priority: row.priority,
  title: row.title,
  message: row.message,
  isRead: row.isRead,
  readAt: row.readAt,
  metadata: parseMetadata(row),
  dedupeKey: row.dedupeKey,
  createdAt: row.createdAt
});

/** Preference toggles that gate each notification category. */
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

export const DEFAULT_PREFERENCES = {
  budgetAlerts: true,
  upcomingPayments: true,
  paymentProcessing: true,
  savingsGoals: true,
  lowBalance: true
};

/**
 * Create one notification for a user.
 *
 * Returns the created row, or null when the user has disabled the category
 * or an identical notification (same dedupeKey) already exists. Never
 * throws for a duplicate — idempotency is the caller's contract.
 */
export const createNotification = async (userId, payload) => {
  const type = assertType(payload.type);
  const priority = assertPriority(payload.priority || 'INFO');
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

  try {
    const row = await prisma.notification.create({
      data: {
        userId,
        type,
        priority,
        title,
        message,
        metadata: serializeMetadata(payload.metadata),
        dedupeKey
      }
    });
    return serializeNotification(row);
  } catch (error) {
    // P2002: the unique (userId, dedupeKey) index rejected a duplicate.
    // That is the idempotency contract working — not an error.
    if (error && error.code === 'P2002') return null;
    throw error;
  }
};

/** Paginated list, newest first. `limit` is clamped to 50 (§30).
 *  Optional `types` is a comma-separated list of notification types. */
export const listNotifications = async (userId, { page = 1, limit = 20, types } = {}) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 50);
  const skip = (safePage - 1) * safeLimit;

  const where = { userId };
  if (types) {
    const typeList = String(types).split(',').map((t) => t.trim()).filter(Boolean);
    if (typeList.length > 0) {
      const invalid = typeList.filter((t) => !NOTIFICATION_TYPES.includes(t));
      if (invalid.length > 0) {
        throw new AppError(`Invalid notification types: ${invalid.join(', ')}`, 400);
      }
      where.type = { in: typeList };
    }
  }

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: safeLimit
    }),
    prisma.notification.count({ where })
  ]);

  return {
    notifications: rows.map(serializeNotification),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
};

export const getUnreadCount = async (userId) => {
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });
  return { unreadCount };
};

/** Mark one notification read. Only the owner may touch it. */
export const markRead = async (userId, notificationId) => {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId }
  });
  if (!existing) throw new AppError('Notification not found', 404);

  const row = await prisma.notification.update({
    where: { id: existing.id },
    data: { isRead: true, readAt: new Date() }
  });
  return serializeNotification(row);
};

export const markAllRead = async (userId) => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() }
  });
  return { updated: result.count };
};

/** Delete one notification. Only the owner may delete it. */
export const deleteNotification = async (userId, notificationId) => {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId }
  });
  if (!existing) throw new AppError('Notification not found', 404);

  await prisma.notification.delete({ where: { id: existing.id } });
  return { id: existing.id, deleted: true };
};

/** Preferences for a user, falling back to all-true defaults. */
export const getPreferences = async (userId) => {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId }
  });
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    budgetAlerts: row.budgetAlerts,
    upcomingPayments: row.upcomingPayments,
    paymentProcessing: row.paymentProcessing,
    savingsGoals: row.savingsGoals,
    lowBalance: row.lowBalance
  };
};

/** Upsert the single preference row per user (§31: one record per user). */
export const updatePreferences = async (userId, payload = {}) => {
  const allowed = Object.keys(DEFAULT_PREFERENCES);
  const data = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      if (typeof payload[key] !== 'boolean') {
        throw new AppError(`${key} must be a boolean`, 400);
      }
      data[key] = payload[key];
    }
  }

  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data
  });

  return {
    budgetAlerts: row.budgetAlerts,
    upcomingPayments: row.upcomingPayments,
    paymentProcessing: row.paymentProcessing,
    savingsGoals: row.savingsGoals,
    lowBalance: row.lowBalance
  };
};

// ---------------------------------------------------------------------------
// Business-specific creation paths
// ---------------------------------------------------------------------------

/**
 * Budget alerts for the current calendar month.
 *
 * Reuses the Phase 4 budget service for all maths (no second copy of the
 * threshold logic) and fires BUDGET_WARNING at 85% / BUDGET_EXCEEDED at
 * 100%. Dedupe key includes the budget period, so a new month gets fresh
 * alerts while repeated runs in the same month are no-ops.
 */
export const createBudgetAlerts = async (userId, { now = new Date() } = {}) => {
  const today = toUtcDay(now);
  const overview = await getBudgetOverview(userId, {
    month: today.getUTCMonth() + 1,
    year: today.getUTCFullYear()
  });

  const period = `${overview.year}-${String(overview.month).padStart(2, '0')}`;
  let created = 0;

  for (const budget of overview.budgets) {
    const pct = budget.percentageUsed;
    if (pct >= BUDGET_ALERT_THRESHOLDS.EXCEEDED) {
      const result = await createNotification(userId, {
        type: 'BUDGET_EXCEEDED',
        priority: 'IMPORTANT',
        title: `Budget exceeded: ${budget.category.name}`,
        message: `You have spent ${Math.round(pct)}% of your ${budget.category.name} budget for ${overview.monthLabel} (₹${budget.spentAmount} of ₹${budget.budgetAmount}).`,
        dedupeKey: `budget:${budget.id}:${period}:EXCEEDED`,
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
      if (result) created += 1;
    } else if (pct >= BUDGET_ALERT_THRESHOLDS.WARNING) {
      const result = await createNotification(userId, {
        type: 'BUDGET_WARNING',
        priority: 'WARNING',
        title: `Budget warning: ${budget.category.name}`,
        message: `You have used ${Math.round(pct)}% of your ${budget.category.name} budget for ${overview.monthLabel} (₹${budget.spentAmount} of ₹${budget.budgetAmount}).`,
        dedupeKey: `budget:${budget.id}:${period}:WARNING`,
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
      if (result) created += 1;
    }
  }

  return { created };
};

/**
 * Upcoming payment reminders for active recurring expenses.
 *
 * Anti-spam policy: at most one notification per (item, due date,
 * milestone). The milestones are 7, 3 and 1 days before the due date, so a
 * single payment produces at most three reminders per cycle, and repeated
 * runs on the same day never duplicate them.
 */
export const createUpcomingPaymentAlerts = async (userId, { now = new Date() } = {}) => {
  const today = toUtcDay(now);
  const items = await prisma.recurringExpense.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, amount: true, nextDueDate: true }
  });

  let created = 0;

  for (const item of items) {
    const dueDay = toUtcDay(item.nextDueDate);
    const daysUntil = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

    // Only future due dates inside the widest milestone window.
    if (daysUntil < 1 || daysUntil > Math.max(...UPCOMING_PAYMENT_MILESTONES)) continue;

    for (const milestone of UPCOMING_PAYMENT_MILESTONES) {
      if (daysUntil !== milestone) continue;

      const result = await createNotification(userId, {
        type: 'UPCOMING_PAYMENT',
        priority: 'WARNING',
        title: `Upcoming payment: ${item.name}`,
        message: `Your recurring payment "${item.name}" of ₹${item.amount} is due in ${milestone} day${milestone === 1 ? '' : 's'} (${dayString(dueDay)}).`,
        dedupeKey: `upcoming:${item.id}:${dayString(dueDay)}:${milestone}`,
        metadata: {
          recurringExpenseId: item.id,
          name: item.name,
          amount: item.amount,
          dueDate: dayString(dueDay),
          daysUntil: milestone
        }
      });
      if (result) created += 1;
    }
  }

  return { created };
};

/**
 * Goal alerts: completion at 100% and factual deadline reminders.
 *
 * Completion is deduped per goal (one celebration per goal, ever).
 * Deadline reminders fire once per goal per target date while the goal is
 * still ACTIVE and the date is within the 7-day window. The copy is
 * strictly factual — it never claims the goal is behind or failed.
 */
export const createGoalAlerts = async (userId, { now = new Date() } = {}) => {
  const today = toUtcDay(now);
  const goals = await prisma.savingsGoal.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      targetAmount: true,
      currentAmount: true,
      targetDate: true,
      status: true
    }
  });

  let created = 0;

  for (const goal of goals) {
    if (goal.status === GOAL_STATUS.COMPLETED) {
      const result = await createNotification(userId, {
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
      if (result) created += 1;
      continue;
    }

    if (goal.status !== GOAL_STATUS.ACTIVE) continue;

    const targetDay = toUtcDay(goal.targetDate);
    const daysUntil = Math.round((targetDay.getTime() - today.getTime()) / 86400000);
    if (daysUntil < 0 || daysUntil > GOAL_DEADLINE_WINDOW_DAYS) continue;

    const result = await createNotification(userId, {
      type: 'GOAL_DEADLINE',
      priority: 'WARNING',
      title: `Goal deadline: ${goal.name}`,
      message: daysUntil === 0
        ? `Your goal "${goal.name}" is due today (target ₹${goal.targetAmount}, saved ₹${goal.currentAmount}).`
        : `Your goal "${goal.name}" is due in ${daysUntil} day${daysUntil === 1 ? '' : 's'} (${dayString(targetDay)}). Saved ₹${goal.currentAmount} of ₹${goal.targetAmount}.`,
      dedupeKey: `goal:${goal.id}:${dayString(targetDay)}:DEADLINE`,
      metadata: {
        goalId: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        targetDate: dayString(targetDay),
        daysUntil
      }
    });
    if (result) created += 1;
  }

  return { created };
};

/**
 * Low balance alerts for accounts with a configured threshold.
 *
 * Anti-spam: one notification per account per calendar day. The message is
 * factual only — no advice, no inference about why the balance is low.
 */
export const createLowBalanceAlerts = async (userId, { now = new Date() } = {}) => {
  const today = toUtcDay(now);
  const dayKey = dayString(today);

  const accounts = await prisma.account.findMany({
    where: { userId, lowBalanceThreshold: { not: null } },
    select: { id: true, name: true, balance: true, lowBalanceThreshold: true }
  });

  let created = 0;

  for (const account of accounts) {
    if (account.balance > account.lowBalanceThreshold) continue;

    const result = await createNotification(userId, {
      type: 'LOW_BALANCE',
      priority: 'WARNING',
      title: `Low balance: ${account.name}`,
      message: `Your account "${account.name}" balance is ₹${account.balance}, at or below your threshold of ₹${account.lowBalanceThreshold}.`,
      dedupeKey: `lowbalance:${account.id}:${dayKey}`,
      metadata: {
        accountId: account.id,
        name: account.name,
        balance: account.balance,
        threshold: account.lowBalanceThreshold,
        date: dayKey
      }
    });
    if (result) created += 1;
  }

  return { created };
};

/**
 * Run every scheduled notification check for one user (or all users when
 * `userId` is omitted). Safe to run repeatedly — every creation path is
 * deduped, so a second run in the same period creates nothing.
 *
 * Returns the number of notifications created per category.
 */
export const processScheduledNotifications = async (userId = null, { now = new Date() } = {}) => {
  const userIds = userId
    ? [userId]
    : (await prisma.user.findMany({ select: { id: true } })).map((user) => user.id);

  const totals = {
    budget: 0,
    upcomingPayments: 0,
    goals: 0,
    lowBalance: 0
  };

  for (const id of userIds) {
    const budget = await createBudgetAlerts(id, { now });
    totals.budget += budget.created;

    const upcoming = await createUpcomingPaymentAlerts(id, { now });
    totals.upcomingPayments += upcoming.created;

    const goals = await createGoalAlerts(id, { now });
    totals.goals += goals.created;

    const lowBalance = await createLowBalanceAlerts(id, { now });
    totals.lowBalance += lowBalance.created;
  }

  return { usersProcessed: userIds.length, ...totals };
};
