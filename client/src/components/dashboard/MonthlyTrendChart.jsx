import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { formatCurrency } from '../../utils/format';
import { ChartDataTable } from './chartUtils';
import { compactTick, SERIES_COLUMNS } from './chartTicks';

/**
 * Monthly trend over the last 6–12 months (§6).
 * Values come from database aggregation — nothing here is hardcoded.
 */
export default function MonthlyTrendChart({ months, label }) {
  const currency = (value) => formatCurrency(value);
  const totalIncome = months.reduce((sum, point) => sum + point.income, 0);
  const totalExpense = months.reduce((sum, point) => sum + point.expense, 0);
  const description =
    `Monthly income and expenses for the ${months.length} months ending ${label}. ` +
    `Income ${currency(totalIncome)}, expenses ${currency(totalExpense)}.`;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{description}</figcaption>
      <div role="img" aria-label={description} className="w-full" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} isAnimationActive={false}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={compactTick}
              width={46}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => currency(value)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              cursor={{ fill: 'rgba(17, 24, 39, 0.04)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Income" fill="#16a34a" isAnimationActive={false} />
            <Bar dataKey="expense" name="Expenses" fill="#ef4444" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption={`Monthly income and expenses for the ${months.length} months ending ${label}`}
        rows={months}
        columns={SERIES_COLUMNS}
      />
    </figure>
  );
}
