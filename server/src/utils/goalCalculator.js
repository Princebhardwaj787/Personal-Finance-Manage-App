/**
 * Savings goal calculation utilities.
 *
 * This module is the SINGLE SOURCE OF TRUTH for every savings-goal derived
 * value. Nothing else in the codebase recomputes remaining amount,
 * percentage or completion — controllers and services call in here so the
 * rules can never drift apart.
 *
 * Monetary fields on goal rows are stored in integer minor units (paise).
 * `serializeGoal` converts them to decimal major units for API output.
 */

import { fromMinorUnits } from './money.js';

export const GOAL_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED'
});

export const GOAL_STATUSES = Object.freeze(Object.values(GOAL_STATUS));

/** Round to 2 decimal places so API responses stay stable. */
export const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Amount still needed to reach the target. Never negative.
 *  Input/output in minor units (paise) to match the stored columns. */
export const calculateRemainingAmount = (goal) =>
  Math.max(round2(goal.targetAmount - goal.currentAmount), 0);

/**
 * Percentage of the target funded, capped at 100.
 * Overfunding is not supported, so the cap only guards against float drift.
 * Unit-agnostic: works with minor units or decimal.
 */
export const calculatePercentageComplete = (goal) => {
  const target = Number(goal.targetAmount);
  const current = Number(goal.currentAmount);
  if (!Number.isFinite(target) || target <= 0) return 0;
  if (!Number.isFinite(current) || current <= 0) return 0;
  return round2(Math.min((current / target) * 100, 100));
};

/** A goal is complete once it is funded to at least its target. */
export const isGoalComplete = (goal) =>
  Number(goal.currentAmount) >= Number(goal.targetAmount);

/**
 * Derive the persisted status for a goal.
 *
 * ARCHIVED is a user-owned state and always wins. Otherwise a fully funded
 * goal resolves to COMPLETED. This function is called by the create,
 * contribute and update paths — there is no second copy of the rule.
 */
export const resolveGoalStatus = (goal) => {
  if (goal.status === GOAL_STATUS.ARCHIVED) return GOAL_STATUS.ARCHIVED;
  return isGoalComplete(goal) ? GOAL_STATUS.COMPLETED : GOAL_STATUS.ACTIVE;
};

/**
 * Shape a goal (optionally with contribution metadata) for API responses.
 * Derived values are computed here and never stored in the database.
 *
 * Monetary fields (targetAmount, currentAmount, remainingAmount) are stored
 * in minor units and converted to decimal major units here for the client.
 */
export const serializeGoal = (goal, extra = {}) => ({
  id: goal.id,
  name: goal.name,
  description: goal.description ?? null,
  targetAmount: fromMinorUnits(goal.targetAmount),
  currentAmount: fromMinorUnits(goal.currentAmount),
  remainingAmount: fromMinorUnits(calculateRemainingAmount(goal)),
  percentageComplete: calculatePercentageComplete(goal),
  targetDate: goal.targetDate,
  status: goal.status,
  accountId: goal.accountId ?? null,
  createdAt: goal.createdAt,
  updatedAt: goal.updatedAt,
  ...extra
});
