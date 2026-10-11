import { formatMoney, formatDate } from '../../utils/format';

/**
 * Report preview renderer (Phase 8 §12).
 *
 * Renders the JSON report returned by the backend. Each report type has a
 * focused, responsive layout — tables on desktop, stacked cards on mobile.
 * All numbers come from the server; no financial maths happens here.
 */

const STATUS_STYLES = {
  OK: 'bg-green-100 text-green-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  EXCEEDED: 'bg-red-100 text-red-800',
  NO_BUDGET: 'bg-gray-100 text-gray-600'
};

const StatusBadge = ({ status }) => (
  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.NO_BUDGET}`}>
    {status}
  </span>
);

const SummaryCard = ({ label, value, accent }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-xl font-semibold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
  </div>
);

const DataTable = ({ columns, rows, rowKey }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {columns.map((col) => (
            <th key={col} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-100">
        {rows.map((row, i) => (
          <tr key={rowKey ? row[rowKey] : i} className="hover:bg-gray-50">
            {columns.map((col) => (
              <td key={col} className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                {row[col]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MonthlyView = ({ report }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard label="Income" value={formatMoney(report.summary.totalIncome)} accent="text-green-600" />
      <SummaryCard label="Expenses" value={formatMoney(report.summary.totalExpenses)} accent="text-red-600" />
      <SummaryCard label="Net Savings" value={formatMoney(report.summary.netSavings)} accent="text-blue-600" />
      <SummaryCard label="Savings Rate" value={`${report.summary.savingsRate ?? 0}%`} accent="text-purple-600" />
    </div>

    {report.budget && report.budget.budgetCount > 0 && (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Budget Summary</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Total Budget</p>
            <p className="text-lg font-semibold">{formatMoney(report.budget.totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Spent</p>
            <p className="text-lg font-semibold text-red-600">{formatMoney(report.budget.totalSpent)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Usage</p>
            <p className="text-lg font-semibold">{report.budget.usagePercent}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <StatusBadge status={report.budget.status} />
          </div>
        </div>
      </div>
    )}

    {report.topCategories.length > 0 && (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Spending Categories</h3>
        <div className="space-y-2">
          {report.topCategories.map((cat) => (
            <div key={cat.name} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{cat.name}</span>
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(cat.sharePercent, 100)}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-900 w-20 text-right">{formatMoney(cat.amount)}</span>
                <span className="text-xs text-gray-500 w-12 text-right">{cat.sharePercent}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {report.largestTransactions.length > 0 && (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Largest Transactions</h3>
        <div className="space-y-2">
          {report.largestTransactions.map((txn) => (
            <div key={txn.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-900">{txn.description}</p>
                <p className="text-xs text-gray-500">{formatDate(txn.date)} · {txn.account?.name}</p>
              </div>
              <span className={`text-sm font-semibold ${txn.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                {txn.type === 'INCOME' ? '+' : '−'}{formatMoney(txn.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const YearlyView = ({ report }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard label="Total Income" value={formatMoney(report.summary.totalIncome)} accent="text-green-600" />
      <SummaryCard label="Total Expenses" value={formatMoney(report.summary.totalExpenses)} accent="text-red-600" />
      <SummaryCard label="Total Savings" value={formatMoney(report.summary.totalSavings)} accent="text-blue-600" />
      <SummaryCard label="Savings Rate" value={`${report.summary.savingsRate ?? 0}%`} accent="text-purple-600" />
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <SummaryCard label="Avg Monthly Income" value={formatMoney(report.summary.averageMonthlyIncome)} />
      <SummaryCard label="Avg Monthly Expenses" value={formatMoney(report.summary.averageMonthlyExpenses)} />
      <SummaryCard label="Avg Monthly Savings" value={formatMoney(report.summary.averageMonthlySavings)} />
    </div>

    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Monthly Breakdown</h3>
      <DataTable
        columns={['Month', 'Income', 'Expenses', 'Savings']}
        rows={report.months.map((m) => ({
          Month: m.label,
          Income: formatMoney(m.income),
          Expenses: formatMoney(m.expenses),
          Savings: formatMoney(m.savings)
        }))}
      />
    </div>
  </div>
);

const TransactionsView = ({ report }) => (
  <div className="space-y-4">
    <p className="text-sm text-gray-500">
      Showing {report.items.length} of {report.total} transactions
    </p>
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <DataTable
        columns={report.columns}
        rows={report.items.map((t) => ({
          Date: formatDate(t.date),
          Description: t.description || '—',
          Category: t.category?.name || 'Uncategorized',
          Account: t.account?.name || '—',
          Type: t.type,
          Amount: formatMoney(t.amount),
          Notes: t.notes || '—'
        }))}
        rowKey="id"
      />
    </div>
  </div>
);

const CategoriesView = ({ report }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <SummaryCard label="Total Expenses" value={formatMoney(report.totalExpenses)} />
      <SummaryCard label="Categories" value={report.categories.length} />
    </div>
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <DataTable
        columns={['Category', 'Total Amount', 'Percentage of Expenses', 'Number of Transactions']}
        rows={report.categories.map((c) => ({
          Category: c.name,
          'Total Amount': formatMoney(c.amount),
          'Percentage of Expenses': `${c.sharePercent}%`,
          'Number of Transactions': c.count
        }))}
      />
    </div>
  </div>
);

const BudgetsView = ({ report }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard label="Total Budget" value={formatMoney(report.totals.totalBudget)} />
      <SummaryCard label="Total Spent" value={formatMoney(report.totals.totalSpent)} accent="text-red-600" />
      <SummaryCard label="Remaining" value={formatMoney(report.totals.remainingAmount)} />
      <SummaryCard label="Usage" value={`${report.totals.usagePercent}%`} />
    </div>
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <DataTable
        columns={['Category', 'Budget', 'Spent', 'Remaining', 'Usage %', 'Status']}
        rows={report.budgets.map((b) => ({
          Category: b.category?.name || 'Uncategorized',
          Budget: formatMoney(b.budgetAmount),
          Spent: formatMoney(b.spentAmount),
          Remaining: formatMoney(b.remainingAmount),
          'Usage %': `${b.percentageUsed}%`,
          Status: <StatusBadge status={b.status} />
        }))}
        rowKey="id"
      />
    </div>
  </div>
);

const AccountsView = ({ report }) => (
  <div className="space-y-4">
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <DataTable
        columns={['Account', 'Current Balance', 'Total Income', 'Total Expenses', 'Number of Transactions', 'Transfers In', 'Transfers Out']}
        rows={report.accounts.map((a) => ({
          Account: a.name,
          'Current Balance': formatMoney(a.balance),
          'Total Income': formatMoney(a.income),
          'Total Expenses': formatMoney(a.expenses),
          'Number of Transactions': a.transactionCount,
          'Transfers In': formatMoney(a.transfersIn),
          'Transfers Out': formatMoney(a.transfersOut)
        }))}
        rowKey="id"
      />
    </div>
  </div>
);

const VIEWS = {
  monthly: MonthlyView,
  yearly: YearlyView,
  transactions: TransactionsView,
  categories: CategoriesView,
  budgets: BudgetsView,
  accounts: AccountsView
};

export default function ReportPreview({ report }) {
  if (!report) return null;
  const View = VIEWS[report.type];
  if (!View) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {report.period.label} — {report.type.charAt(0).toUpperCase() + report.type.slice(1)} Report
        </h2>
        <span className="text-xs text-gray-500">
          {report.period.startISO} → {report.period.endInclusiveISO}
        </span>
      </div>
      <View report={report} />
    </div>
  );
}
