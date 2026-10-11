/**
 * Recurring expense calculation utilities.
 *
 * Shared by the recurring-expense endpoints AND the dashboard so the
 * monthly/yearly maths is defined exactly once.
 *
 * Recurring expenses are tracking/planning records only. Nothing in this
 * module ever creates a Transaction.
 */

export const FREQUENCIES = Object.freeze(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

/** Occurrences per year for each frequency. */
const OCCURRENCES_PER_YEAR = Object.freeze({
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1
});

/** Unit label used in the UI: "₹649 / month". */
const FREQUENCY_LABELS = Object.freeze({
  WEEKLY: 'week',
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  YEARLY: 'year'
});

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const isKnownFrequency = (frequency) =>
  Object.prototype.hasOwnProperty.call(OCCURRENCES_PER_YEAR, frequency);

/** WEEKLY ×52 · MONTHLY ×12 · QUARTERLY ×4 · YEARLY ×1 */
export const toYearly = (amount, frequency) => {
  if (!isKnownFrequency(frequency)) return 0;
  return round2(Number(amount) * OCCURRENCES_PER_YEAR[frequency]);
};

/** Yearly cost normalised to a month (weekly ×52/12, quarterly ×4/12). */
export const toMonthly = (amount, frequency) => {
  if (!isKnownFrequency(frequency)) return 0;
  return round2((Number(amount) * OCCURRENCES_PER_YEAR[frequency]) / 12);
};

export const frequencyLabel = (frequency) => FREQUENCY_LABELS[frequency] || '';

/** Whole days until a date. Negative for past-due items; 0 for today. */
export const daysUntil = (date, now = new Date()) => {
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) return 0;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
};

/** Human readable "Due in 3 days" / "Due today" / "5 days overdue". */
export const dueLabel = (date, now = new Date()) => {
  const days = daysUntil(date, now);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  return `Due in ${days} days`;
};

/**
 * One-pass totals across a list of recurring expenses.
 * Only pass already-filtered ACTIVE rows in here.
 */
export const summarize = (items = []) => {
  let monthlyCost = 0;
  let yearlyCost = 0;

  for (const item of items) {
    monthlyCost += toMonthly(item.amount, item.frequency);
    yearlyCost += toYearly(item.amount, item.frequency);
  }

  return {
    activeCount: items.length,
    monthlyCost: round2(monthlyCost),
    yearlyCost: round2(yearlyCost)
  };
};

/** Shape a row for API responses (no derived totals stored in the DB). */
export const serializeRecurringExpense = (item) => ({
  id: item.id,
  name: item.name,
  amount: item.amount,
  frequency: item.frequency,
  frequencyLabel: frequencyLabel(item.frequency),
  monthlyAmount: toMonthly(item.amount, item.frequency),
  yearlyAmount: toYearly(item.amount, item.frequency),
  nextDueDate: item.nextDueDate,
  daysUntilDue: daysUntil(item.nextDueDate),
  dueLabel: dueLabel(item.nextDueDate),
  description: item.description ?? null,
  isActive: item.isActive,
  accountId: item.accountId,
  account: item.account ?? undefined,
  categoryId: item.categoryId,
  category: item.category ?? undefined,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt
});
