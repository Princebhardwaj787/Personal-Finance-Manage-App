import { AppError } from './AppError.js';

/**
 * SINGLE DATE STRATEGY FOR ALL ANALYTICS
 * =======================================
 * Every financial date in this app is a UTC calendar date:
 *   - `Transaction.date` is a timestamp stored as epoch-ms (Prisma/SQLite).
 *   - Date-only inputs arrive as `YYYY-MM-DD` and are interpreted as UTC midnight.
 *   - Every range below is `[start, end)` — `start` inclusive, `end` EXCLUSIVE,
 *     i.e. `end` is midnight of the first day that must NOT match.
 *
 * Using an exclusive end is what makes month/year/leap-year boundaries correct:
 * `where: { date: { gte: start, lt: end } }` includes every instant of the last
 * day. The previous `lte: new Date('YYYY-MM-DD')` cut the last day off at
 * 00:00 UTC, silently dropping that day's transactions.
 */

export const PERIODS = [
  'this_month',
  'last_month',
  'last_3_months',
  'last_6_months',
  'this_year',
  'custom'
];

export const GRANULARITIES = ['day', 'week', 'month'];

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/** Longest period a custom range may span (guards query cost). */
const MAX_RANGE_DAYS = 366 * 3;

/** Build a Date at UTC midnight. `month` is 1-12. */
export const utcDay = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

/** Drop the time component, keeping the UTC calendar date. */
export const toUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Days in a month, leap years included (month is 1-12). */
export const daysInUtcMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Midnight UTC of the first day of the month containing `date`. */
export const startOfUtcMonth = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

/** Add whole months to a UTC date, clamping the day to the month length. */
export const addUtcMonths = (date, offset) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + offset; // 0-11, may be negative / > 11
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInUtcMonth(targetYear, targetMonth + 1));
  return new Date(Date.UTC(targetYear, targetMonth, day));
};

export const addUtcDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

/** `[start, end)` for one calendar month (month is 1-12). */
export const monthRange = (year, month) => {
  const start = utcDay(year, month, 1);
  const end = addUtcMonths(start, 1); // exclusive
  return { start, end };
};

/**
 * Parse a `YYYY-MM-DD` (or full ISO) value into a Date at UTC midnight.
 * Rejects impossible dates such as 2026-02-31 instead of rolling them over.
 */
export const parseIsoDay = (value, field = 'Date') => {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`${field} is required`, 400);
  }
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);

  let date;
  if (match) {
    const [, y, m, d] = match;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (year < 1900 || year > 2999 || month < 1 || month > 12) {
      throw new AppError(`${field} must be a valid date`, 400);
    }
    date = utcDay(year, month, day);
    // Round-trip check catches 2026-02-31 / 2026-13-01.
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new AppError(`${field} must be a valid date`, 400);
    }
  } else {
    date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a valid date`, 400);
    date = toUtcDay(date);
  }
  return date;
};

const formatMonthYear = (year, month) => `${MONTHS_LONG[month - 1]} ${year}`;

const formatMonthYearShort = (year, month) => `${MONTHS_SHORT[month - 1]} ${year}`;

const formatSpanLabel = (start, endExclusive, period) => {
  const lastDay = addUtcDays(endExclusive, -1);
  const s = { y: start.getUTCFullYear(), m: start.getUTCMonth() + 1 };
  const e = { y: lastDay.getUTCFullYear(), m: lastDay.getUTCMonth() + 1 };

  if (period === 'this_year') return String(s.y);
  if (s.y === e.y && s.m === e.m) return formatMonthYear(s.y, s.m);
  if (s.y === e.y) return `${MONTHS_SHORT[s.m - 1]} – ${MONTHS_SHORT[e.m - 1]} ${s.y}`;
  return `${formatMonthYearShort(s.y, s.m)} – ${formatMonthYearShort(e.y, e.m)}`;
};

const defaultGranularity = (days) => {
  if (days <= 14) return 'day';
  if (days <= 45) return 'week';
  return 'month';
};

/**
 * Turn `{ period, startDate, endDate }` into an explicit `[start, end)` range.
 * `now` is injectable so tests can pin the clock.
 */
export const resolveRange = ({ period = 'this_month', startDate, endDate, granularity, now } = {}) => {
  if (!PERIODS.includes(period)) {
    throw new AppError(`Period must be one of: ${PERIODS.join(', ')}`, 400);
  }

  const ref = now ? new Date(now) : new Date();
  const today = toUtcDay(ref);
  const currentMonth = startOfUtcMonth(today);

  let start;
  let end; // exclusive

  switch (period) {
    case 'this_month':
      start = currentMonth;
      end = addUtcMonths(currentMonth, 1);
      break;
    case 'last_month': {
      const prev = addUtcMonths(currentMonth, -1);
      start = prev;
      end = currentMonth;
      break;
    }
    case 'last_3_months':
      start = addUtcMonths(currentMonth, -2);
      end = addUtcMonths(currentMonth, 1);
      break;
    case 'last_6_months':
      start = addUtcMonths(currentMonth, -5);
      end = addUtcMonths(currentMonth, 1);
      break;
    case 'this_year':
      start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      end = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));
      break;
    default: {
      // custom: both ends are inclusive calendar days -> [start, endExclusive)
      start = parseIsoDay(startDate, 'startDate');
      end = addUtcDays(parseIsoDay(endDate, 'endDate'), 1);
      break;
    }
  }

  if (end.getTime() <= start.getTime()) {
    throw new AppError('startDate must be on or before endDate', 400);
  }

  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days > MAX_RANGE_DAYS) {
    throw new AppError('Date range cannot exceed 3 years', 400);
  }

  let resolvedGranularity;
  if (granularity) {
    if (!GRANULARITIES.includes(granularity)) {
      throw new AppError(`granularity must be one of: ${GRANULARITIES.join(', ')}`, 400);
    }
    resolvedGranularity = granularity;
  } else {
    resolvedGranularity = defaultGranularity(days);
  }

  return {
    period,
    start,
    end, // EXCLUSIVE
    days,
    granularity: resolvedGranularity,
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10), // exclusive
    endInclusiveISO: addUtcDays(end, -1).toISOString().slice(0, 10),
    label: formatSpanLabel(start, end, period)
  };
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Prisma `where.date` filter for an INCLUSIVE start/end pair.
 *
 * Returns `undefined` when neither bound is given, so callers can simply do:
 *   const filter = dateFilter(start, end); if (filter) where.date = filter;
 * The end bound is converted to an EXCLUSIVE next-day midnight, which is what
 * fixes "transactions made on the last day of the range are dropped".
 */
export const dateFilter = (startDate, endDate) => {
  if (!startDate && !endDate) return undefined;
  const filter = {};
  if (startDate) filter.gte = parseIsoDay(startDate, 'startDate');
  if (endDate) filter.lt = addUtcDays(parseIsoDay(endDate, 'endDate'), 1);
  return filter;
};

/**
 * Split a range into contiguous buckets for charting.
 * Buckets are returned as `[start, endExclusive)` and always cover the range
 * exactly — no gaps, no overlaps.
 */
export const enumerateBuckets = (range, granularity = range.granularity) => {
  const { start, end } = range;
  const buckets = [];

  if (granularity === 'month') {
    let cursor = startOfUtcMonth(start);
    let index = 0;
    while (cursor < end && index < 120) {
      const bucketEnd = addUtcMonths(cursor, 1);
      const bucketStart = cursor < start ? start : cursor;
      const effectiveEnd = bucketEnd > end ? end : bucketEnd;
      buckets.push({
        key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
        label: formatMonthYearShort(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1),
        start: bucketStart,
        end: effectiveEnd,
        isPartial: bucketStart.getTime() !== cursor.getTime() || effectiveEnd.getTime() !== bucketEnd.getTime()
      });
      cursor = bucketEnd;
      index += 1;
    }
    return buckets;
  }

  const step = granularity === 'week' ? 7 : 1;
  let cursor = start;
  let index = 0;
  while (cursor < end && index < 400) {
    const bucketEnd = addUtcDays(cursor, step) > end ? end : addUtcDays(cursor, step);
    buckets.push({
      key: `${index + 1}`,
      label: granularity === 'week'
        ? `Week ${index + 1}`
        : `${cursor.getUTCDate()} ${MONTHS_SHORT[cursor.getUTCMonth()]}`,
      start: cursor,
      end: bucketEnd,
      isPartial: bucketEnd.getTime() - cursor.getTime() !== step * DAY_MS
    });
    cursor = bucketEnd;
    index += 1;
  }
  return buckets;
};

/**
 * The last `count` calendar months, ending with the current month
 * (inclusive). Used by the monthly trend chart, which is not period-scoped.
 */
export const enumerateMonthlyBuckets = (count, now) => {
  const size = clamp(parseInt(count, 10) || 12, 6, 24);
  const ref = now ? new Date(now) : new Date();
  const current = startOfUtcMonth(ref);
  const buckets = [];

  for (let offset = size - 1; offset >= 0; offset -= 1) {
    const monthStart = addUtcMonths(current, -offset);
    buckets.push({
      key: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
      label: formatMonthYearShort(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1),
      longLabel: formatMonthYear(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1),
      start: monthStart,
      end: addUtcMonths(monthStart, 1)
    });
  }
  return buckets;
};

/** The calendar month a period's end date falls in (budgets are month-scoped). */
export const monthAtEnd = (range) => {
  const lastDay = addUtcDays(range.end, -1);
  return { year: lastDay.getUTCFullYear(), month: lastDay.getUTCMonth() + 1 };
};

export const currentMonth = (now) => {
  const start = startOfUtcMonth(now ? new Date(now) : new Date());
  return {
    year: start.getUTCFullYear(),
    month: start.getUTCMonth() + 1,
    label: formatMonthYear(start.getUTCFullYear(), start.getUTCMonth() + 1)
  };
};

export const monthLabel = (year, month) => formatMonthYear(year, month);
