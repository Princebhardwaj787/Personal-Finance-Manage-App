import { formatCurrency, formatDate } from '../../utils/format';

/**
 * Recent transactions (§12). Deliberately capped server-side so the dashboard
 * never renders a user's full history.
 */
export default function RecentTransactionsList({ transactions }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[22rem]">
        <caption className="sr-only">Most recent transactions</caption>
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th scope="col" className="pb-2 font-medium">Date</th>
            <th scope="col" className="pb-2 font-medium">Description</th>
            <th scope="col" className="pb-2 font-medium">Category</th>
            <th scope="col" className="pb-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {transactions.map((txn) => (
            <tr key={txn.id} className="hover:bg-gray-50">
              <td className="py-2.5 text-sm text-gray-500 whitespace-nowrap">{formatDate(txn.date)}</td>
              <td className="py-2.5 text-sm text-gray-900">
                {txn.description || '—'}
                {txn.account?.name && (
                  <span className="block text-xs text-gray-400">{txn.account.name}</span>
                )}
              </td>
              <td className="py-2.5">
                {txn.category ? (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                    style={{ backgroundColor: `${txn.category.color}20`, color: txn.category.color }}
                  >
                    {txn.category.icon && <span aria-hidden="true" className="mr-1">{txn.category.icon}</span>}
                    {txn.category.name}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Uncategorised</span>
                )}
              </td>
              <td className="py-2.5 text-sm font-medium text-right whitespace-nowrap">
                <span className={txn.type === 'INCOME' ? 'text-green-600' : 'text-danger-600'}>
                  <span aria-hidden="true">{txn.type === 'INCOME' ? '+' : '−'}</span>
                  <span className="sr-only">{txn.type === 'INCOME' ? 'Income ' : 'Expense '}</span>
                  {formatCurrency(txn.amount)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
