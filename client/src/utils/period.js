/**
 * Dashboard period utilities (spec §4, §23).
 *
 * Mirrors the server's UTC calendar-date strategy in `server/src/utils/dateRange.js`:
 * every boundary is UTC midnight, ranges are `[start, endExclusive)`, and a
 * date-only value is `YYYY-MM-DD`. Keeping one strategy on both sides is what
 * makes "This Month" mean the same thing in the UI and in the SQL.
 */

export const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom' }
];

export const PERIOD_VALUES = PERIOD_OPTIONS.map((option) => option.value);

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const pad = (value) => String(value).padStart(2, '0');

export const toIsoDay = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export const startOfUtcMonth = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const daysInUtcMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const addUtcDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

export const addUtcMonths = (date, offset) => {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth() + offset;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInUtcMonth(targetYear, targetMonth + 1));
  return new Date(Date.UTC(targetYear, targetMonth, day));
};

/** `YYYY-MM-DD` -> Date at UTC midnight. Returns null when not a real date. */
export const parseIsoDay = (value) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2999 || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
};

const formatDay = (date) =>
  `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

/** Same wording the server uses for `period.label`. */
export const formatRangeLabel = (start, endExclusive, period) => {
  const lastDay = addUtcDays(endExclusive, -1);
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth() + 1;
  const endYear = lastDay.getUTCFullYear();
  const endMonth = lastDay.getUTCMonth() + 1;

  if (period === 'custom') return `${formatDay(start)} – ${formatDay(lastDay)}`;
  if (period === 'this_year') return String(startYear);
  if (startYear === endYear && startMonth === endMonth) return `${MONTHS_LONG[startMonth - 1]} ${startYear}`;
  if (startYear === endYear) return `${MONTHS_SHORT[startMonth - 1]} – ${MONTHS_SHORT[endMonth - 1]} ${startYear}`;
  return `${MONTHS_SHORT[startMonth - 1]} ${startYear} – ${MONTHS_SHORT[endMonth - 1]} ${endYear}`;
};

/**
 * Resolve the selected period into the exact query the API expects plus the
 * display label. `valid === false` means the draft must NOT be sent — the UI
 * keeps showing the last committed period instead of refetching garbage.
 */
export const resolvePeriod = ({ period = 'this_month', startDate, endDate } = {}) => {
  if (!PERIOD_VALUES.includes(period)) {
    return { valid: false, error: 'Unknown period', query: null, label: '' };
  }

  const today = todayUtc();
  const currentMonth = startOfUtcMonth(today);
  let start;
  let end; // exclusive

  switch (period) {
    case 'this_month':
      start = currentMonth;
      end = addUtcMonths(currentMonth, 1);
      break;
    case 'last_month': {
      const previous = addUtcMonths(currentMonth, -1);
      start = previous;
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
      if (!startDate || !endDate) {
        return { valid: false, error: null, query: null, label: '', needsDates: true };
      }
      const from = parseIsoDay(startDate);
      const to = parseIsoDay(endDate);
      if (!from) return { valid: false, error: 'Start date must be a valid date', query: null, label: '' };
      if (!to) return { valid: false, error: 'End date must be a valid date', query: null, label: '' };
      if (from.getTime() > to.getTime()) {
        return { valid: false, error: 'Start date must be on or before end date', query: null, label: '' };
      }
      start = from;
      end = addUtcDays(to, 1);
      break;
    }
  }

  const query = period === 'custom'
    ? { period, startDate, endDate }
    : { period };

  return {
    valid: true,
    error: null,
    needsDates: false,
    query,
    start,
    end,
    startISO: toIsoDay(start),
    endISO: toIsoDay(end),
    label: formatRangeLabel(start, end, period)
  };
};

/** Sensible default custom range: the current calendar month. */
export const currentMonthRange = () => {
  const start = startOfUtcMonth(todayUtc());
  return { start: toIsoDay(start), end: toIsoDay(addUtcDays(addUtcMonths(start, 1), -1)) };
};
