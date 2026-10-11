import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { formatCurrency } from '../../utils/format';
import { compactTick } from './chartTicks';

const FALLBACK_COLOR = '#16a34a';

/**
 * Spending by category (§7).
 *
 * A horizontal bar chart is used because the job is comparing magnitudes —
 * aligned bars are far easier to rank than pie slices. The visible ranked list
 * beside it (§8) doubles as the accessible data table.
 */
export default function CategorySpendingChart({ categories, label }) {
  const currency = (value) => formatCurrency(value);
  const height = Math.min(Math.max(categories.length * 46 + 40, 220), 420);
  const total = categories.reduce((sum, item) => sum + item.amount, 0);
  const description =
    `Spending by category for ${label}. Total ${currency(total)} across ${categories.length} categories.`;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{description}</figcaption>
      <div role="img" aria-label={description} className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={categories}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
            isAnimationActive={false}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={compactTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 12, fill: '#374151' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => currency(value)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              cursor={{ fill: 'rgba(17, 24, 39, 0.04)' }}
            />
            <Bar dataKey="amount" name="Spent" isAnimationActive={false} barSize={20}>
              {categories.map((item, index) => (
                <Cell key={item.categoryId ?? index} fill={item.color || FALLBACK_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Spending by category for {label}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Spent</th>
            <th scope="col">Share</th>
            <th scope="col">Transactions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((item) => (
            <tr key={item.categoryId ?? item.name}>
              <th scope="row">{item.name}</th>
              <td>{currency(item.amount)}</td>
              <td>{item.sharePercent}%</td>
              <td>{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
