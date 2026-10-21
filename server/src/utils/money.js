/**
 * MONEY UTILITIES (Phase 1 §3 — financial precision)
 * ==================================================
 * Single source of truth for all monetary amounts.
 *
 * Authoritative storage: integer minor units (paise for INR).
 *   - 1 INR = 100 paise
 *   - ₹1,000.00  -> 100000 (stored)
 *   - ₹100.50    -> 10050   (stored)
 *
 * All arithmetic on stored values is integer math — exact, no binary
 * floating-point drift. Division by 100 happens ONLY at the presentation
 * boundary (API response / UI formatting), never in a calculation that
 * affects a balance.
 *
 * Rounding rule: when converting a decimal amount to minor units, round to
 * the nearest paise (`Math.round(amount * 100)`). Amounts with more than 2
 * decimal places are rounded to the nearest paise and the rounded value is
 * authoritative; callers that need to reject sub-paise input should validate
 * precision before calling `toMinorUnits`.
 */

const MINOR_UNITS_PER_MAJOR = 100;

/** Convert a decimal major-unit amount (e.g. 100.50) to integer minor units (10050). */
export const toMinorUnits = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    throw new Error(`Amount must be a finite number, got ${amount}`);
  }
  return Math.round(value * MINOR_UNITS_PER_MAJOR);
};

/** Convert integer minor units back to a decimal major-unit amount (display only). */
export const fromMinorUnits = (minorUnits) => {
  const value = Number(minorUnits);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Minor units must be a finite integer, got ${minorUnits}`);
  }
  return value / MINOR_UNITS_PER_MAJOR;
};

/** Validate that a value is a positive integer minor unit. Returns the value. */
export const assertMinorUnits = (value, field = 'Amount') => {
  const minorUnits = Number(value);
  if (!Number.isInteger(minorUnits) || !Number.isFinite(minorUnits)) {
    throw new Error(`${field} must be a whole number of minor units (paise)`);
  }
  if (minorUnits <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }
  return minorUnits;
};

/** Validate that a value is a non-negative integer minor unit. */
export const assertNonNegativeMinorUnits = (value, field = 'Amount') => {
  const minorUnits = Number(value);
  if (!Number.isInteger(minorUnits) || !Number.isFinite(minorUnits)) {
    throw new Error(`${field} must be a whole number of minor units (paise)`);
  }
  if (minorUnits < 0) {
    throw new Error(`${field} must not be negative`);
  }
  return minorUnits;
};

/** Round a decimal to exactly 2 decimal places (presentation helper only). */
export const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export { MINOR_UNITS_PER_MAJOR };
