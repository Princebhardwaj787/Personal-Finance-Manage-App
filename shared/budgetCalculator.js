/**
 * BUDGET CALCULATOR (shared domain)
 * ==================================
 * The single source of truth for every budget-derived number.
 *
 * The Express server and the Android client BOTH import this module, so a
 * budget can never look different on the two platforms.
 *
 * Status semantics (unchanged from the original Phase 4 implementation):
 *   ON_TRACK  < 80%   |   WARNING  < 100%   |   EXCEEDED >= 100%
 *
 * Money note: the inputs and outputs are DECIMAL MAJOR UNITS. Callers that
 * read from the database convert minor units first (see `fromMinorUnits`).
 * The arithmetic is unit-agnostic — both sides of the ratio are in the same
 * unit — so the percentage is exact either way.
 */

import { fromMinorUnits } from './money.js';

export const BUDGET_STATUS_THRESHOLDS = Object.freeze({
  ON_TRACK: 79.99,
  WARNING: 99.99,
  EXCEEDED: 100
});

/** Round to 2 decimal places so API responses stay stable. */
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Pure: percentage -> status. Used for per-budget AND overall totals. */
export const resolveBudgetStatus = (
  percentageUsed,
  thresholds = BUDGET_STATUS_THRESHOLDS
) => {
  if (percentageUsed >= thresholds.EXCEEDED) return 'EXCEEDED';
  if (percentageUsed >= thresholds.WARNING) return 'WARNING';
  return 'ON_TRACK';
};

/**
 * Pure: derive every displayed number for one budget from two values.
 *
 * Inputs are expected in minor units (as stored in the DB) and the result is
 * returned in decimal major units, ready for the API.
 */
export const computeBudgetStatus = (budgetAmount, spentAmount) => {
  const safeBudget = fromMinorUnits(Number(budgetAmount) || 0);
  const spent = fromMinorUnits(Number(spentAmount) || 0);
  const percentageUsed = safeBudget > 0 ? (spent / safeBudget) * 100 : 0;

  return {
    budgetAmount: round2(safeBudget),
    spentAmount: round2(spent),
    remainingAmount: round2(safeBudget - spent),
    percentageUsed: Math.round(percentageUsed * 100) / 100,
    status: resolveBudgetStatus(percentageUsed)
  };
};
