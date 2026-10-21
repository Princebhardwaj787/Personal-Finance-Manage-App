/**
 * UNIT TESTS — MONEY UTILITIES (Phase 1 §3)
 * ==========================================
 * Pure functions: no database needed.
 * Verifies integer minor-unit (paise) arithmetic is exact and conversions
 * between decimal major units and minor units round-trip correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  toMinorUnits,
  fromMinorUnits,
  assertMinorUnits,
  assertNonNegativeMinorUnits,
  round2,
  MINOR_UNITS_PER_MAJOR
} from '../../src/utils/money.js';

describe('money conversion', () => {
  it('defines 100 minor units per major unit', () => {
    expect(MINOR_UNITS_PER_MAJOR).toBe(100);
  });

  it('converts decimal major units to integer minor units', () => {
    expect(toMinorUnits(1000.00)).toBe(100000); // ₹1,000.00 -> 100000 paise
    expect(toMinorUnits(100.50)).toBe(10050); // ₹100.50 -> 10050 paise
    expect(toMinorUnits(0.01)).toBe(1); // ₹0.01 -> 1 paise
    expect(toMinorUnits(0)).toBe(0);
  });

  it('rounds sub-paise values to the nearest paise', () => {
    expect(toMinorUnits(100.005)).toBe(10001); // rounds up
    expect(toMinorUnits(100.004)).toBe(10000); // rounds down
  });

  it('converts minor units back to decimal major units', () => {
    expect(fromMinorUnits(100000)).toBe(1000);
    expect(fromMinorUnits(10050)).toBe(100.5);
    expect(fromMinorUnits(1)).toBe(0.01);
    expect(fromMinorUnits(0)).toBe(0);
  });

  it('round-trips decimal -> minor -> decimal for standard currency values', () => {
    const values = [0.01, 0.10, 1.00, 10.25, 100.50, 1000.00, 99999.99];
    for (const v of values) {
      expect(fromMinorUnits(toMinorUnits(v))).toBeCloseTo(v, 4);
    }
  });

  it('rejects non-finite input', () => {
    expect(() => toMinorUnits(NaN)).toThrow();
    expect(() => toMinorUnits(Infinity)).toThrow();
    expect(() => toMinorUnits('abc')).toThrow();
  });
});

describe('assertMinorUnits / assertNonNegativeMinorUnits', () => {
  it('accepts positive integers', () => {
    expect(assertMinorUnits(10050)).toBe(10050);
    expect(() => assertMinorUnits(0)).toThrow(); // must be > 0
    expect(() => assertMinorUnits(-5)).toThrow();
  });

  it('accepts zero and positive integers for non-negative', () => {
    expect(assertNonNegativeMinorUnits(0)).toBe(0);
    expect(assertNonNegativeMinorUnits(10050)).toBe(10050);
    expect(() => assertNonNegativeMinorUnits(-1)).toThrow();
  });

  it('rejects non-integers', () => {
    expect(() => assertMinorUnits(100.5)).toThrow();
    expect(() => assertNonNegativeMinorUnits(100.5)).toThrow();
  });
});

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(100.005)).toBe(100.01);
    expect(round2(100.004)).toBe(100);
    expect(round2(0.1 + 0.2)).toBe(0.3); // guards float drift
  });
});
