/**
 * Phase 6 frontend smoke test.
 *
 * Bundles the real dashboard modules with esbuild and renders them with
 * react-dom/server. This proves every new component mounts without runtime
 * errors (unresolved imports, undefined components, broken JSX, bad prop
 * access) — including the full Dashboard page in its loading state.
 *
 * Test-only accommodations because there is no DOM in Node:
 *  - a minimal `document`/`window` stub (Modal.jsx and recharts touch them)
 *  - an esbuild resolve shim that inlines `createPortal`, because React's
 *    server renderer rejects portals (error #200) before rendering them
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

const clientDir = path.join(__dirname, 'client');
const esbuild = require(path.join(clientDir, 'node_modules', 'esbuild'));

const entry = `
import { renderToString } from 'react-dom/server';
import { createElement as h } from 'react';
import { MemoryRouter } from 'react-router-dom';

import Dashboard from './src/pages/Dashboard';
import Section from './src/components/dashboard/Section';
import SectionBoundary from './src/components/dashboard/SectionBoundary';
import PeriodSelector from './src/components/dashboard/PeriodSelector';
import SummaryCards from './src/components/dashboard/SummaryCards';
import SavingsRateCard from './src/components/dashboard/SavingsRateCard';
import BudgetProgress from './src/components/dashboard/BudgetProgress';
import TopCategoriesList from './src/components/dashboard/TopCategoriesList';
import SavingsGoalProgress from './src/components/dashboard/SavingsGoalProgress';
import UpcomingPaymentsList from './src/components/dashboard/UpcomingPaymentsList';
import RecentTransactionsList from './src/components/dashboard/RecentTransactionsList';
import IncomeExpenseChart from './src/components/dashboard/IncomeExpenseChart';
import MonthlyTrendChart from './src/components/dashboard/MonthlyTrendChart';
import CategorySpendingChart from './src/components/dashboard/CategorySpendingChart';
import { CardsSkeleton, ChartSkeleton, ListSkeleton } from './src/components/dashboard/Skeleton';
import EmptyState from './src/ui/EmptyState';
import ErrorState from './src/ui/ErrorState';
import { resolvePeriod, formatRangeLabel, parseIsoDay, currentMonthRange } from './src/utils/period';

const withRouter = (node) => h(MemoryRouter, { initialEntries: ['/dashboard'] }, null, node);

const summary = {
  period: {
    period: 'this_month', start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z',
    endInclusive: '2026-09-30', label: 'September 2026', granularity: 'week', days: 30
  },
  totalBalance: 43523, totalIncome: 50000, totalExpenses: 16477, totalTransfers: 0,
  netSavings: 33523, savingsRate: 67.05, hasIncome: true, totalSavings: 32000,
  savings: { activeCount: 1, completedCount: 0, archivedCount: 1, totalSaved: 32000, totalTargets: 80000 },
  recurring: { activeCount: 2, monthlyCost: 2000, yearlyCost: 24000, upcomingCount: 2, nextDueDate: '2026-10-03' }
};

const zeroSummary = Object.assign({}, summary, {
  totalBalance: 0, totalIncome: 0, totalExpenses: 0, netSavings: 0,
  savingsRate: null, hasIncome: false, totalSavings: 0,
  savings: { activeCount: 0, completedCount: 0, archivedCount: 0, totalSaved: 0, totalTargets: 0 }
});

const negativeSummary = Object.assign({}, summary, {
  totalIncome: 20000, totalExpenses: 31000, netSavings: -11000, savingsRate: -55, hasIncome: true
});

const overview = {
  month: 9, year: 2026, monthLabel: 'September 2026', budgetCount: 3,
  budgets: [
    { id: 'b1', category: { id: 'c1', name: 'Food & Dining', icon: '🍔', color: '#ef4444' },
      budgetAmount: 8000, spentAmount: 8277, remainingAmount: -277, percentageUsed: 103.46, status: 'EXCEEDED' },
    { id: 'b2', category: { id: 'c2', name: 'Shopping', icon: '🛍️', color: '#dc2626' },
      budgetAmount: 4000, spentAmount: 5000, remainingAmount: -1000, percentageUsed: 125, status: 'EXCEEDED' },
    { id: 'b3', category: { id: 'c3', name: 'Transport', icon: '🚌', color: '#b91c1c' },
      budgetAmount: 10000, spentAmount: 3200, remainingAmount: 6800, percentageUsed: 32, status: 'ON_TRACK' }
  ],
  alerts: [
    { budgetId: 'b1', category: overview_category('Food & Dining'), status: 'EXCEEDED',
      spentAmount: 8277, budgetAmount: 8000, remainingAmount: -277, percentageUsed: 103.46 },
    { budgetId: 'b2', category: overview_category('Shopping'), status: 'EXCEEDED',
      spentAmount: 5000, budgetAmount: 4000, remainingAmount: -1000, percentageUsed: 125 }
  ],
  totals: { totalBudget: 22000, totalSpent: 16477, remainingAmount: 5523,
    usagePercent: 74.9, status: 'ON_TRACK', exceededCount: 2, warningCount: 0 }
};

function overview_category(name) {
  return { id: name, name, icon: 'x', color: '#ef4444' };
}

const buckets = [
  { key: '1', label: 'Week 1', start: 's', end: 'e', income: 50000, expense: 8277, net: 41723 },
  { key: '2', label: 'Week 2', start: 's', end: 'e', income: 0, expense: 5000, net: -5000 },
  { key: '3', label: 'Week 3', start: 's', end: 'e', income: 0, expense: 3450, net: -3450 }
];

const trend = { period: summary.period, granularity: 'week', buckets,
  totals: { income: 50000, expense: 16727, net: 33273 } };

const categories = {
  period: summary.period, totalExpenses: 16477, hasExpenses: true,
  categories: [
    { categoryId: 'c1', name: 'Food & Dining', icon: '🍔', color: '#ef4444', amount: 8277, count: 2, sharePercent: 50.23 },
    { categoryId: 'c2', name: 'Shopping', icon: '🛍️', color: '#dc2626', amount: 5000, count: 1, sharePercent: 30.35 },
    { categoryId: 'c3', name: 'Transport', icon: '🚌', color: '#b91c1c', amount: 3200, count: 1, sharePercent: 19.42 }
  ],
  topCategories: []
};
categories.topCategories = categories.categories;

const months = [];
for (let i = 12; i >= 1; i -= 1) {
  months.push({ key: 'k' + i, label: 'M' + i, start: 's', end: 'e',
    income: i % 2 ? 50000 : 40000, expense: i % 2 ? 16477 : 12000, net: i % 2 ? 33523 : 28000 });
}
const monthly = { months, count: 12,
  totals: { income: 540000, expense: 173724, net: 366276, savings: 366276, savingsRate: 67.83, hasIncome: true } };

const goal = {
  id: 'g1', name: 'New Laptop', targetAmount: 80000, currentAmount: 32000,
  remainingAmount: 48000, percentageComplete: 40, targetDate: '2027-03-01',
  status: 'ACTIVE', contributionsCount: 1
};

const recurring = {
  id: 'r1', name: 'Gym', amount: 1000, frequency: 'MONTHLY', frequencyLabel: 'month',
  monthlyAmount: 1000, yearlyAmount: 12000, nextDueDate: '2026-10-03', daysUntilDue: 3,
  dueLabel: 'Due in 3 days', description: '', isActive: true,
  accountId: 'a1', categoryId: 'c1',
  account: { id: 'a1', name: 'Bank' }, category: { id: 'c1', name: 'Health' }
};

const transaction = {
  id: 't1', type: 'EXPENSE', amount: 777, description: 'Month end shop',
  date: '2026-09-30T18:00:00.000Z',
  account: { id: 'a1', name: 'P6 Bank' },
  category: { id: 'c1', name: 'Food & Dining', icon: '🍔', color: '#ef4444' }
};

const noIncomeOverview = { categories: [], label: 'x' };

const cases = [
  ['Dashboard (loading state)', () => withRouter(h(Dashboard))],
  ['PeriodSelector (default)', () => h(PeriodSelector, {
    draftPeriod: 'this_month', isCustom: false, customStart: '', customEnd: '',
    error: null, needsDates: false, label: 'September 2026',
    onSelect() {}, onChangeStart() {}, onChangeEnd() {}
  })],
  ['PeriodSelector (custom + validation error)', () => h(PeriodSelector, {
    draftPeriod: 'custom', isCustom: true, customStart: '2026-09-10', customEnd: '2026-09-01',
    error: 'Start date must be on or before end date', needsDates: false, label: '',
    onSelect() {}, onChangeStart() {}, onChangeEnd() {}
  })],
  ['PeriodSelector (custom, awaiting dates)', () => h(PeriodSelector, {
    draftPeriod: 'custom', isCustom: true, customStart: '', customEnd: '',
    error: null, needsDates: true, label: '',
    onSelect() {}, onChangeStart() {}, onChangeEnd() {}
  })],
  ['SummaryCards (loading)', () => h(SummaryCards, { loading: true, label: 'September 2026' })],
  ['SummaryCards (with data)', () => h(SummaryCards, { summary, loading: false, label: 'September 2026' })],
  ['SummaryCards (no data yet)', () => h(SummaryCards, { summary: null, loading: false, label: 'September 2026' })],
  ['SummaryCards (negative net savings)', () => h(SummaryCards, { summary: negativeSummary, loading: false, label: 'September 2026' })],
  ['SavingsRateCard (with income)', () => h(SavingsRateCard, { summary, label: 'September 2026' })],
  ['SavingsRateCard (income = 0 -> no NaN/Infinity)', () => h(SavingsRateCard, { summary: zeroSummary, label: 'September 2026' })],
  ['SavingsRateCard (negative rate)', () => h(SavingsRateCard, { summary: negativeSummary, label: 'September 2026' })],
  ['BudgetProgress (normal)', () => h(BudgetProgress, { overview })],
  ['BudgetProgress (no budgets)', () => h(BudgetProgress, {
    overview: { month: 1, year: 2021, monthLabel: 'January 2021', budgetCount: 0,
      budgets: [], alerts: [],
      totals: { totalBudget: 0, totalSpent: 0, remainingAmount: 0, usagePercent: 0,
        status: 'NO_BUDGET', exceededCount: 0, warningCount: 0 } }
  })],
  ['BudgetProgress (overspent totals)', () => h(BudgetProgress, {
    overview: Object.assign({}, overview, {
      alerts: overview.alerts,
      totals: { totalBudget: 4000, totalSpent: 16477, remainingAmount: -12477,
        usagePercent: 411.93, status: 'EXCEEDED', exceededCount: 2, warningCount: 0 }
    })
  })],
  ['TopCategoriesList', () => h(TopCategoriesList, { categories: categories.categories })],
  ['SavingsGoalProgress', () => h(SavingsGoalProgress, { goals: [goal] })],
  ['UpcomingPaymentsList', () => h(UpcomingPaymentsList, { payments: [recurring] })],
  ['RecentTransactionsList', () => h(RecentTransactionsList, { transactions: [transaction] })],
  ['Section (loading)', () => h(Section, { title: 'Income vs Expenses', loading: true, skeleton: h(ChartSkeleton, {}) })],
  ['Section (error + retry)', () => h(Section, { title: 'Monthly Trend', error: 'boom', onRetry() {} })],
  ['Section (empty + action)', () => h(Section, {
    title: 'Budget Overview', empty: true, emptyTitle: 'No budgets created for this month.',
    emptyDescription: 'Create a budget for September 2026 to start tracking spending.',
    emptyAction: null
  })],
  ['Section (content + refreshing)', () => h(Section, {
    title: 'Savings Goals', refreshing: true, subtitle: '1 active'
  }, h('p', null, 'content'))],
  ['SectionBoundary (happy path)', () => h(SectionBoundary, null, h('p', null, 'ok'))],
  ['IncomeExpenseChart', () => h(IncomeExpenseChart, {
    data: trend.buckets, label: 'September 2026', granularityLabel: 'week'
  })],
  ['IncomeExpenseChart (single bucket)', () => h(IncomeExpenseChart, {
    data: [{ key: '1', label: 'Sep 2026', income: 50000, expense: 16477, net: 33523 }],
    label: 'September 2026', granularityLabel: 'month'
  })],
  ['MonthlyTrendChart', () => h(MonthlyTrendChart, { months: monthly.months, label: 'September 2026' })],
  ['CategorySpendingChart', () => h(CategorySpendingChart, {
    categories: categories.categories, label: 'September 2026'
  })],
  ['CategorySpendingChart (empty)', () => h(CategorySpendingChart, { categories: [], label: 'x' })],
  ['Skeletons', () => h('div', null,
    h(CardsSkeleton, {}), h(ChartSkeleton, {}), h(ListSkeleton, {}))],
  ['EmptyState (compact)', () => h(EmptyState, {
    compact: true, title: 'Nothing', description: 'Empty'
  })],
  ['EmptyState (full screen, unchanged)', () => h(EmptyState, {
    title: 'Nothing', description: 'Empty'
  })],
  ['ErrorState (with retry)', () => h(ErrorState, {
    title: 'Oops', description: 'Error', onRetry() {}
  })]
];

export function run() {
  // No DOM in Node: Modal.jsx reads document.body and recharts checks window.
  globalThis.document = {
    body: {},
    documentElement: { style: {} },
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ style: {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) })
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' })
  };

  const results = [];
  for (const [name, make] of cases) {
    try {
      const html = renderToString(make());
      results.push({ name, ok: typeof html === 'string', html, len: html.length });
    } catch (err) {
      const stack = (err && err.stack ? String(err.stack) : '').split('\\n').slice(0, 4).join(' | ');
      results.push({
        name,
        ok: false,
        error: String(err && err.name) + ': ' + String(err && err.message) + ' >> ' + stack
      });
    }
  }

  // Pure date helpers used by the period selector.
  const assert = [];
  const check = (name, condition, detail) => {
    assert.push({ name: name + (detail ? ' -- ' + detail : ''), ok: Boolean(condition) });
  };

  const thisMonth = resolvePeriod({ period: 'this_month' });
  check('resolvePeriod(this_month) valid', thisMonth.valid && thisMonth.query.period === 'this_month');
  check('resolvePeriod(this_month) label', /^[A-Z][a-z]+ \\d{4}$/.test(thisMonth.label), thisMonth.label);
  check('resolvePeriod(invalid period) rejected', resolvePeriod({ period: 'nope' }).valid === false);
  check('resolvePeriod(custom, no dates) needsDates',
    resolvePeriod({ period: 'custom' }).needsDates === true);
  check('resolvePeriod(custom, backwards) error',
    /on or before/.test(resolvePeriod({ period: 'custom', startDate: '2026-05-10', endDate: '2026-05-01' }).error || ''));
  check('parseIsoDay(2024-02-29) accepted', parseIsoDay('2024-02-29') !== null);
  check('parseIsoDay(2024-02-31) rejected', parseIsoDay('2024-02-31') === null);
  check('formatRangeLabel single month', formatRangeLabel(
    new Date(Date.UTC(2026, 8, 1)), new Date(Date.UTC(2026, 9, 1)), 'this_month'
  ) === 'September 2026');
  check('formatRangeLabel across years', formatRangeLabel(
    new Date(Date.UTC(2025, 10, 1)), new Date(Date.UTC(2026, 2, 1)), 'last_6_months'
  ) === 'Nov 2025 – Feb 2026');
  const cm = currentMonthRange();
  check('currentMonthRange returns ordered ISO days',
    /^\\d{4}-\\d{2}-\\d{2}$/.test(cm.start) && cm.start <= cm.end, JSON.stringify(cm));

  return { renders: results, checks: assert, emptyCategoryFixture: noIncomeOverview };
}
`;

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-smoke6-'));
  const entryPath = path.join(clientDir, '.phase6_smoke_entry.jsx');
  const outPath = path.join(tmp, 'bundle.cjs');

  fs.writeFileSync(entryPath, entry, 'utf8');
  const shimPath = path.join(tmp, 'portal-shim.mjs');
  fs.writeFileSync(shimPath, 'export const createPortal = (children) => children;\n', 'utf8');

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      outfile: outPath,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      jsx: 'automatic',
      absWorkingDir: clientDir,
      nodePaths: [path.join(clientDir, 'node_modules')],
      plugins: [
        {
          name: 'portal-shim',
          setup(build) {
            // Exact match only, so 'react-dom/server' still resolves normally.
            build.onResolve({ filter: /^react-dom$/ }, () => ({ path: shimPath }));
          }
        }
      ],
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'error'
    });
  } finally {
    fs.rmSync(entryPath, { force: true });
  }

  const { run } = require(outPath);
  const { renders, checks } = run();

  let failed = 0;
  console.log('=== PHASE 6 · FRONTEND SMOKE ===\n');
  console.log('Component renders');
  for (const r of renders) {
    if (r.ok) {
      console.log(`  ok   ${r.name}${r.len === 0 ? ' (renders nothing, as expected)' : ''}`);
    } else {
      failed += 1;
      console.log(`  FAIL ${r.name} -- ${r.error}`);
    }
  }

  console.log('\nPeriod utilities');
  for (const c of checks) {
    if (c.ok) console.log(`  ok   ${c.name}`);
    else { failed += 1; console.log(`  FAIL ${c.name}`); }
  }

  const total = renders.length + checks.length;
  console.log(`\n=== FRONTEND SMOKE: ${total - failed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
