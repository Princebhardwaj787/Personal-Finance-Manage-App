/**
 * CURRENCY AND DATE FORMATTING
 * ============================
 *
 * Money note: the API and the on-device database work in integer minor
 * units internally, but the UI receives and displays DECIMAL major units
 * (₹250.75). Amounts that are not whole rupees are shown with paise —
 * rounding "₹250.75" to "₹251" would misstate a financial figure.
 */

/** True when the amount has a fractional part that must be shown. */
const hasFraction = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  return Math.abs(number % 1) > 1e-9;
};

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '0';
  const number = Number(amount);
  if (!Number.isFinite(number)) return '0';
  const fraction = hasFraction(number);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: fraction ? 2 : 0,
    maximumFractionDigits: fraction ? 2 : 0
  }).format(number);
};

/** Currency-aware variant: uses the owning account's currency when known. */
export const formatMoney = (amount, currency = 'INR') => {
  if (amount === null || amount === undefined || amount === '') return '0';
  const number = Number(amount);
  if (!Number.isFinite(number)) return '0';
  const fraction = hasFraction(number);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: fraction ? 2 : 0,
      maximumFractionDigits: fraction ? 2 : 0
    }).format(number);
  } catch {
    return `${currency || ''} ${number.toFixed(fraction ? 2 : 0)}`.trim();
  }
};

/** A compact form for charts and tiles: 1.2K, 3.4L, 1.2Cr. */
export const formatCompact = (amount) => {
  const number = Number(amount);
  if (!Number.isFinite(number)) return '0';
  const absolute = Math.abs(number);
  if (absolute >= 1e7) return `${(number / 1e7).toFixed(2)}Cr`;
  if (absolute >= 1e5) return `${(number / 1e5).toFixed(2)}L`;
  if (absolute >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return String(number);
};

export const formatDate = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export const getMonthName = (month) => {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return names[month - 1] || '';
};
