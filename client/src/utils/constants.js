/**
 * Shared UI constants for Phase 5.
 * Mirrors the enums accepted by the API (validated server-side too).
 */

export const GOAL_STATUSES = Object.freeze(['ACTIVE', 'COMPLETED', 'ARCHIVED']);

export const FREQUENCIES = Object.freeze(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

export const FREQUENCY_OPTIONS = Object.freeze([
  { value: 'WEEKLY', label: 'Weekly', per: 'week', timesPerYear: 52 },
  { value: 'MONTHLY', label: 'Monthly', per: 'month', timesPerYear: 12 },
  { value: 'QUARTERLY', label: 'Quarterly', per: 'quarter', timesPerYear: 4 },
  { value: 'YEARLY', label: 'Yearly', per: 'year', timesPerYear: 1 }
]);

export const GOAL_STATUS_LABELS = Object.freeze({
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived'
});
