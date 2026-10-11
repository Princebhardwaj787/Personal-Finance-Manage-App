import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import Section from '../components/dashboard/Section';
import SectionBoundary from '../components/dashboard/SectionBoundary';
import { ChartSkeleton, ListSkeleton } from '../components/dashboard/Skeleton';
import PeriodSelector from '../components/dashboard/PeriodSelector';
import SummaryCards from '../components/dashboard/SummaryCards';
import SavingsRateCard from '../components/dashboard/SavingsRateCard';
import BudgetProgress from '../components/dashboard/BudgetProgress';
import TopCategoriesList from '../components/dashboard/TopCategoriesList';
import SavingsGoalProgress from '../components/dashboard/SavingsGoalProgress';
import UpcomingPaymentsList from '../components/dashboard/UpcomingPaymentsList';
import RecentTransactionsList from '../components/dashboard/RecentTransactionsList';
import FinancialAlertsSection from '../components/dashboard/FinancialAlertsSection';
import useDashboardPeriod from '../hooks/useDashboardPeriod';
import useSectionFetch from '../hooks/useSectionFetch';
import { dashboardApi } from '../services/dashboardApi';
import { analyticsApi } from '../services/analyticsApi';

// Charts are the heaviest part of the page — keep them out of the first bundle.
const IncomeExpenseChart = lazy(() => import('../components/dashboard/IncomeExpenseChart'));
const MonthlyTrendChart = lazy(() => import('../components/dashboard/MonthlyTrendChart'));
const CategorySpendingChart = lazy(() => import('../components/dashboard/CategorySpendingChart'));

const GRANULARITY_LABEL = { day: 'day', week: 'week', month: 'month' };

/**
 * A link that looks like a button. Deliberately NOT `<Link><Button/></Link>` —
 * nesting a <button> inside an <a> is invalid and confuses screen readers.
 */
const LinkButton = ({ to, children, variant = 'secondary' }) => (
  <Link
    to={to}
    className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}
  >
    {children}
  </Link>
);

export default function Dashboard() {
  const period = useDashboardPeriod();
  const queryKey = JSON.stringify(period.query);

  // Period-scoped: refetch together when the period changes (§4).
  const summary = useSectionFetch(() => dashboardApi.summary(period.query), `summary:${queryKey}`);
  const budget = useSectionFetch(() => dashboardApi.budgetOverview(period.query), `budget:${queryKey}`);
  const incomeExpense = useSectionFetch(() => analyticsApi.incomeExpenses(period.query), `income-expense:${queryKey}`);
  const categorySpending = useSectionFetch(() => analyticsApi.categorySpending(period.query), `category:${queryKey}`);

  // Not period-scoped: fetched once on mount and never re-fetched (§12–§14).
  const monthlyTrends = useSectionFetch(() => analyticsApi.monthlyTrends(12), 'monthly-trends');
  const widgets = useSectionFetch(() => dashboardApi.widgets(), 'widgets');

  const hasTransactions = (widgets.data?.activity?.transactionCount ?? 0) > 0;

  const summaryData = summary.data;
  const trendData = incomeExpense.data;
  const categoryData = categorySpending.data;
  const budgetData = budget.data;
  const monthlyData = monthlyTrends.data;
  const widgetData = widgets.data;

  const addTransactionButtons = (
    <div className="flex items-center gap-2">
      <LinkButton to="/income">Add Income</LinkButton>
      <LinkButton to="/expenses" variant="primary">Add Expense</LinkButton>
    </div>
  );

  const noTransactionsAction = <LinkButton to="/transactions">View transactions</LinkButton>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of your finances · {period.label}</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <PeriodSelector
            draftPeriod={period.draftPeriod}
            isCustom={period.isCustom}
            customStart={period.customStart}
            customEnd={period.customEnd}
            error={period.error}
            needsDates={period.needsDates}
            label={period.label}
            onSelect={period.selectPeriod}
            onChangeStart={period.changeCustomStart}
            onChangeEnd={period.changeCustomEnd}
          />
          {addTransactionButtons}
        </div>
      </div>

      {/* 1. Financial summary */}
      <SummaryCards summary={summaryData} loading={summary.loading} label={period.label} />

      {/* 2. Monthly overview: income vs expenses + savings rate */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section
          className="lg:col-span-2"
          title="Income vs Expenses"
          subtitle={`By ${GRANULARITY_LABEL[trendData?.granularity] || 'week'} · ${period.label}`}
          loading={incomeExpense.loading}
          refreshing={incomeExpense.refreshing}
          error={incomeExpense.error}
          onRetry={incomeExpense.retry}
          empty={Boolean(trendData) && trendData.totals.income === 0 && trendData.totals.expense === 0}
          emptyTitle={hasTransactions ? 'No income or expenses recorded for this period.' : 'No transactions yet.'}
          emptyDescription={hasTransactions
            ? undefined
            : 'Add your first transaction to start seeing your spending analytics.'}
          emptyAction={noTransactionsAction}
          skeleton={<ChartSkeleton height={260} label="Loading income vs expenses…" />}
        >
          <SectionBoundary>
            <Suspense fallback={<ChartSkeleton height={260} label="Loading income vs expenses…" />}>
              {trendData && (
                <IncomeExpenseChart
                  data={trendData.buckets}
                  label={period.label}
                  granularityLabel={GRANULARITY_LABEL[trendData.granularity] || 'week'}
                />
              )}
            </Suspense>
          </SectionBoundary>
        </Section>

        <Section
          title="Savings Rate"
          subtitle={`For ${period.label}`}
          loading={summary.loading}
          refreshing={summary.refreshing}
          error={summary.error}
          onRetry={summary.retry}
        >
          {summaryData && <SavingsRateCard summary={summaryData} label={period.label} />}
        </Section>
      </div>

      {/* 3. Budget overview + spending by category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section
          title="Budget Overview"
          subtitle={budgetData?.monthLabel}
          action={(
            <Link
              to="/budgets"
              className="text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              Manage budgets
            </Link>
          )}
          loading={budget.loading}
          refreshing={budget.refreshing}
          error={budget.error}
          onRetry={budget.retry}
          empty={Boolean(budgetData) && budgetData.budgetCount === 0}
          emptyTitle="No budgets created for this month."
          emptyDescription={budgetData ? `Create a budget for ${budgetData.monthLabel} to start tracking spending.` : undefined}
          emptyAction={<LinkButton to="/budgets">Create a budget</LinkButton>}
          skeleton={<ListSkeleton rows={4} label="Loading budget overview…" />}
        >
          {budgetData && <BudgetProgress overview={budgetData} />}
        </Section>

        <Section
          title="Spending by Category"
          subtitle={period.label}
          loading={categorySpending.loading}
          refreshing={categorySpending.refreshing}
          error={categorySpending.error}
          onRetry={categorySpending.retry}
          empty={Boolean(categoryData) && !categoryData.hasExpenses}
          emptyTitle="No expense data available for this period."
          skeleton={<ChartSkeleton height={300} label="Loading spending by category…" />}
        >
          <div className="space-y-6">
            <SectionBoundary>
              <Suspense fallback={<ChartSkeleton height={300} label="Loading spending by category…" />}>
                {categoryData && (
                  <CategorySpendingChart categories={categoryData.categories} label={period.label} />
                )}
              </Suspense>
            </SectionBoundary>

            {categoryData?.topCategories?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Top spending categories</h3>
                <TopCategoriesList categories={categoryData.topCategories} />
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* 4. Monthly trend */}
      <Section
        title="Monthly Trend"
        subtitle={monthlyData ? `Last ${monthlyData.count} months` : 'Last 12 months'}
        loading={monthlyTrends.loading}
        refreshing={monthlyTrends.refreshing}
        error={monthlyTrends.error}
        onRetry={monthlyTrends.retry}
        empty={Boolean(monthlyData) && monthlyData.totals.income === 0 && monthlyData.totals.expense === 0}
        emptyTitle={hasTransactions ? 'No income or expenses recorded in the last 12 months.' : 'No transactions yet.'}
        emptyDescription={hasTransactions
          ? undefined
          : 'Add your first transaction to start seeing your spending analytics.'}
        emptyAction={noTransactionsAction}
        skeleton={<ChartSkeleton height={300} label="Loading monthly trend…" />}
      >
        <SectionBoundary>
          <Suspense fallback={<ChartSkeleton height={300} label="Loading monthly trend…" />}>
            {monthlyData && <MonthlyTrendChart months={monthlyData.months} label={period.label} />}
          </Suspense>
        </SectionBoundary>
      </Section>

      {/* 5. Recent transactions */}
      <Section
        title="Recent Transactions"
        subtitle="Latest activity"
        action={(
          <Link
            to="/transactions"
            className="text-sm font-medium text-primary-700 hover:text-primary-800"
          >
            View all transactions
          </Link>
        )}
        loading={widgets.loading}
        refreshing={widgets.refreshing}
        error={widgets.error}
        onRetry={widgets.retry}
        empty={Boolean(widgetData) && widgetData.recentTransactions.length === 0}
        emptyTitle="No transactions yet."
        emptyDescription="Add your first transaction to start seeing your spending analytics."
        emptyAction={noTransactionsAction}
        skeleton={<ListSkeleton rows={5} label="Loading recent transactions…" />}
      >
        {widgetData && widgetData.recentTransactions.length > 0 && (
          <RecentTransactionsList transactions={widgetData.recentTransactions} />
        )}
      </Section>

      {/* 6. Savings goals + upcoming payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section
          title="Savings Goals"
          subtitle={widgetData ? `${widgetData.savingsGoals.length} active` : undefined}
          action={(
            <Link
              to="/savings-goals"
              className="text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              View all goals
            </Link>
          )}
          loading={widgets.loading}
          refreshing={widgets.refreshing}
          error={widgets.error}
          onRetry={widgets.retry}
          empty={Boolean(widgetData) && widgetData.savingsGoals.length === 0}
          emptyTitle="No active savings goals."
          emptyDescription="Create a goal to start setting money aside."
          emptyAction={<LinkButton to="/savings-goals">Create a goal</LinkButton>}
          skeleton={<ListSkeleton rows={3} label="Loading savings goals…" />}
        >
          {widgetData && widgetData.savingsGoals.length > 0 && (
            <SavingsGoalProgress goals={widgetData.savingsGoals} />
          )}
        </Section>

        <Section
          title="Upcoming Payments"
          subtitle={widgetData ? `Next ${widgetData.upcomingWindowDays} days` : 'Next 30 days'}
          action={(
            <Link
              to="/recurring-expenses"
              className="text-sm font-medium text-primary-700 hover:text-primary-800"
            >
              View all
            </Link>
          )}
          loading={widgets.loading}
          refreshing={widgets.refreshing}
          error={widgets.error}
          onRetry={widgets.retry}
          empty={Boolean(widgetData) && widgetData.upcomingPayments.length === 0}
          emptyTitle="No upcoming payments in the next 30 days."
          emptyDescription="Recurring payments with an upcoming due date appear here."
          emptyAction={<LinkButton to="/recurring-expenses">Manage recurring payments</LinkButton>}
          skeleton={<ListSkeleton rows={3} label="Loading upcoming payments…" />}
        >
          {widgetData && widgetData.upcomingPayments.length > 0 && (
            <UpcomingPaymentsList payments={widgetData.upcomingPayments} />
          )}
        </Section>
      </div>

      {/* 7. Financial alerts (Phase 9) */}
      <FinancialAlertsSection />
    </div>
  );
}
