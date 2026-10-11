import { formatCurrency } from '../../utils/format';

/**
 * Top spending categories (§8) — purely descriptive ranking, never advice.
 * Amount and share are always written out, so the list is readable without
 * relying on the chart's colours.
 */
export default function TopCategoriesList({ categories }) {
  return (
    <ol className="space-y-3">
      {categories.map((item, index) => (
        <li key={item.categoryId ?? item.name} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-gray-400 w-4 shrink-0" aria-hidden="true">
              {index + 1}.
            </span>
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color || '#16a34a' }}
              aria-hidden="true"
            />
            <span className="text-sm text-gray-700 truncate">
              <span className="sr-only">{index + 1}. </span>
              {item.name}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="block text-sm font-semibold text-gray-900">{formatCurrency(item.amount)}</span>
            <span className="block text-xs text-gray-500">{item.sharePercent}% of spending</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
