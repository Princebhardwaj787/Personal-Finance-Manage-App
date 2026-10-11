import { formatCurrency } from '../../utils/format';

/**
 * Pure helpers shared by the dashboard charts.
 *
 * Kept out of chartUtils.jsx so that file exports only a component — files
 * that mix components with plain exports break React Fast Refresh boundaries.
 */
const currency = (value) => formatCurrency(value);

/** Compact axis ticks: 1250 -> "1.3k", 50000 -> "50k". */
export const compactTick = (value) => {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1000) {
    const shortened = number / 1000;
    return `${Number.isInteger(shortened) ? shortened : shortened.toFixed(1)}k`;
  }
  return String(number);
};

export const SERIES_COLUMNS = [
  { key: 'income', label: 'Income', format: currency },
  { key: 'expense', label: 'Expenses', format: currency },
  { key: 'net', label: 'Net', format: currency }
];
