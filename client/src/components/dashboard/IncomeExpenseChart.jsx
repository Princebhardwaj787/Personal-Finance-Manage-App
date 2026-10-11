import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { formatCurrency } from '../../utils/format';
import { ChartDataTable } from './chartUtils';
import { compactTick, SERIES_COLUMNS } from './chartTicks';

/**
 * Income vs expenses over time (§5).
 * Grouped bars compare the two series per bucket; animation is disabled and
 * the whole chart is one labelled image so it stays fast and accessible.
 */
export default function IncomeExpenseChart({ data, label, granularityLabel }) {
  const currency = (value) => formatCurrency(value);
  const totalIncome = data.reduce((sum, point) => sum + point.income, 0);
  const totalExpense = data.reduce((sum, point) => sum + point.expense, 0);
  const description =
    `Income and expenses by ${granularityLabel} for ${label}. ` +
    `Income ${currency(totalIncome)}, expenses ${currency(totalExpense)}.`;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{description}</figcaption>
      <div
        role="img"
        aria-label={description}
        className="w-full"
        style={{ height: 260 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            isAnimationActive={false}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              interval="preserveStartEnd"
              minTickGap={8}
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
        caption={`Income and expenses by ${granularityLabel} for ${label}`}
        rows={data}
        columns={SERIES_COLUMNS}
      />
    </figure>
  );
}
