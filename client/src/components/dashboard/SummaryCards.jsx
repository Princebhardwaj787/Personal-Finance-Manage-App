import Card, { CardContent } from '../ui/Card';
import { CardsSkeleton } from './Skeleton';
import { formatCurrency } from '../../utils/format';

/**
 * Financial Summary (§2).
 *
 * Balance is point-in-time (the Accounts page shows the same number).
 * Income / Expenses / Savings are scoped to the selected period — this is the
 * `Income − Expenses` definition from §9, so the goals figure is shown
 * separately as "Saved in Goals".
 */
const CARDS = [
  { key: 'balance', title: 'Total Balance', hint: 'Across all accounts', icon: WalletIcon, tone: 'text-primary-600 bg-primary-50' },
  { key: 'income', title: 'Income', hint: 'For this period', icon: IncomeIcon, tone: 'text-green-600 bg-green-50' },
  { key: 'expenses', title: 'Expenses', hint: 'For this period', icon: ExpenseIcon, tone: 'text-danger-600 bg-danger-50' },
  { key: 'net', title: 'Savings', hint: 'Income − Expenses', icon: SavingsIcon, tone: 'text-blue-600 bg-blue-50' },
  { key: 'goals', title: 'Saved in Goals', hint: 'Across savings goals', icon: TargetIcon, tone: 'text-warning-600 bg-warning-50' }
];

export default function SummaryCards({ summary, loading, label }) {
  if (loading) return <CardsSkeleton />;

  const values = {
    balance: summary?.totalBalance ?? 0,
    income: summary?.totalIncome ?? 0,
    expenses: summary?.totalExpenses ?? 0,
    net: summary?.netSavings ?? 0,
    goals: summary?.totalSavings ?? 0
  };

  return (
    <section aria-label={`Financial summary for ${label}`} aria-busy={loading || undefined}>
      <h2 className="sr-only">Financial summary</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {CARDS.map((card) => {
          const value = values[card.key];
          const isNegative = card.key === 'net' && value < 0;
          return (
            <Card key={card.key} hover>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500">{card.title}</p>
                    <p
                      className={`text-2xl font-bold mt-1 ${
                        isNegative ? 'text-danger-600' : 'text-gray-900'
                      }`}
                    >
                      {formatCurrency(value)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{card.hint}</p>
                  </div>
                  <div className={`${card.tone} p-3 rounded-xl shrink-0`}>
                    <card.icon className={`w-6 h-6 ${card.tone.split(' ')[0]}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function WalletIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function IncomeIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
    </svg>
  );
}

function ExpenseIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0-5l5-5" />
    </svg>
  );
}

function SavingsIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TargetIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v3m0 12v3M3 12h3m12 0h3M12 8a4 4 0 100 8 4 4 0 000-8zm0 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
    </svg>
  );
}
