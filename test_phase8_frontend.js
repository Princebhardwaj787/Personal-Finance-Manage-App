/**
 * Phase 8 frontend smoke test.
 *
 * Bundles the real Phase 8 modules with esbuild and renders them with
 * react-dom/server. Proves the reports page, filters, preview components and
 * history list all mount without runtime errors.
 *
 * Test-only accommodations because there is no DOM in Node:
 *  - a minimal `document`/`window`/`localStorage` stub
 *  - an esbuild resolve shim that inlines `createPortal`
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

import Reports from './src/pages/Reports';
import ReportFilters from './src/components/reports/ReportFilters';
import ReportPreview from './src/components/reports/ReportPreview';
import ReportHistory from './src/components/reports/ReportHistory';
import Sidebar from './src/components/layout/Sidebar';
import AppRoutes from './src/routes/AppRoutes';
import { AuthProvider } from './src/contexts/AuthProvider';
import { buildQuery } from './src/services/api';
import { formatMoney, formatDate } from './src/utils/format';

const withRouter = (node, to = '/reports') =>
  h(MemoryRouter, { initialEntries: [to] }, null, node);
const withAuth = (node, to = '/reports') =>
  h(MemoryRouter, { initialEntries: [to] }, null, h(AuthProvider, null, node));

const noop = () => {};

const accounts = [
  { id: 'a1', name: 'HDFC Bank', type: 'BANK', balance: 45000, currency: 'INR', icon: null, color: null },
  { id: 'a2', name: 'Cash Wallet', type: 'CASH', balance: 3000, currency: 'INR', icon: null, color: null }
];

const expenseCategories = [
  { id: 'c1', name: 'Food & Dining', icon: '🍔', color: '#ef4444', type: 'EXPENSE' }
];
const incomeCategories = [
  { id: 'c2', name: 'Salary', icon: '💼', color: '#22c55e', type: 'INCOME' }
];

const defaultFilters = {
  period: 'this_month',
  startDate: '',
  endDate: '',
  type: '',
  accountId: '',
  categoryId: '',
  minAmount: '',
  maxAmount: ''
};

const monthlyReport = {
  type: 'monthly',
  period: { startISO: '2026-09-01', endInclusiveISO: '2026-09-30', label: 'September 2026' },
  summary: { totalIncome: 50000, totalExpenses: 31200, netSavings: 18800, savingsRate: 37.6 },
  budget: { month: 9, year: 2026, monthLabel: 'September 2026', budgetCount: 1, totalBudget: 40000, totalSpent: 45000, usagePercent: 112.5, status: 'EXCEEDED' },
  topCategories: [
    { name: 'Food & Dining', amount: 7500, sharePercent: 24, count: 12 },
    { name: 'Bills', amount: 6000, sharePercent: 19.2, count: 5 }
  ],
  largestTransactions: [
    { id: 't1', type: 'EXPENSE', amount: 5000, description: 'Rent', date: '2026-09-01T00:00:00.000Z', account: accounts[0], category: expenseCategories[0] }
  ]
};

const yearlyReport = {
  type: 'yearly',
  period: { startISO: '2026-01-01', endInclusiveISO: '2026-12-31', label: '2026' },
  summary: { totalIncome: 500000, totalExpenses: 312000, totalSavings: 188000, averageMonthlyIncome: 41666.67, averageMonthlyExpenses: 26000, averageMonthlySavings: 15666.67, savingsRate: 37.6 },
  months: Array.from({ length: 12 }, (_, i) => ({
    key: '2026-' + String(i + 1).padStart(2, '0'),
    label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i] + ' 2026',
    income: i === 8 ? 50000 : 0,
    expenses: i === 8 ? 31200 : 0,
    savings: i === 8 ? 18800 : 0
  }))
};

const transactionsReport = {
  type: 'transactions',
  period: { startISO: '2026-09-01', endInclusiveISO: '2026-09-30', label: 'September 2026' },
  columns: ['Date', 'Description', 'Category', 'Account', 'Type', 'Amount', 'Notes'],
  items: [
    { id: 't1', type: 'EXPENSE', amount: 820, description: 'Groceries', notes: 'Weekly shop', date: '2026-09-20T10:00:00.000Z', account: accounts[0], category: expenseCategories[0] },
    { id: 't2', type: 'INCOME', amount: 60000, description: 'Salary', notes: null, date: '2026-09-01T05:30:00.000Z', account: accounts[0], category: incomeCategories[0] }
  ],
  total: 2
};

const categoriesReport = {
  type: 'categories',
  period: { startISO: '2026-09-01', endInclusiveISO: '2026-09-30', label: 'September 2026' },
  categories: [
    { name: 'Food & Dining', amount: 7500, sharePercent: 40, count: 12 },
    { name: 'Bills', amount: 6000, sharePercent: 31.6, count: 5 }
  ],
  totalExpenses: 19000
};

const budgetsReport = {
  type: 'budgets',
  period: { startISO: '2026-09-01', endInclusiveISO: '2026-09-30', label: 'September 2026' },
  month: 9, year: 2026, monthLabel: 'September 2026',
  budgets: [
    { id: 'b1', category: expenseCategories[0], budgetAmount: 8000, spentAmount: 7500, remainingAmount: 500, percentageUsed: 93.75, status: 'WARNING' }
  ],
  totals: { totalBudget: 8000, totalSpent: 7500, remainingAmount: 500, usagePercent: 93.75, status: 'WARNING' }
};

const accountsReport = {
  type: 'accounts',
  period: { startISO: '2026-09-01', endInclusiveISO: '2026-09-30', label: 'September 2026' },
  accounts: [
    { id: 'a1', name: 'HDFC Bank', type: 'BANK', balance: 45000, income: 60000, expenses: 15000, transactionCount: 42, transfersIn: 5000, transfersOut: 3000 }
  ]
};

const historyEntries = [
  { id: 'h1', type: 'monthly', format: 'json', startDate: '2026-09-01', endDate: '2026-09-30', createdAt: '2026-09-30T10:00:00.000Z' },
  { id: 'h2', type: 'transactions', format: 'csv', startDate: '2026-09-01', endDate: '2026-09-30', createdAt: '2026-09-30T09:00:00.000Z' }
];

const cases = [
  ['Reports page (first render)', () => withRouter(h(Reports))],
  ['Sidebar (Reports entry)', () => withAuth(h(Sidebar))],
  ['AppRoutes (/reports resolves to a real route)', () => h(MemoryRouter, { initialEntries: ['/reports'] }, null, h(AuthProvider, null, h(AppRoutes)))],

  ['ReportFilters (default)', () => h(ReportFilters, {
    reportType: 'monthly', onTypeChange: noop, filters: defaultFilters,
    onFilterChange: noop, onGenerate: noop, onClear: noop, loading: false,
    accounts, categories: [...expenseCategories, ...incomeCategories]
  })],
  ['ReportFilters (custom range active)', () => h(ReportFilters, {
    reportType: 'yearly', onTypeChange: noop,
    filters: { ...defaultFilters, period: 'custom', startDate: '2026-01-01', endDate: '2026-12-31', type: 'EXPENSE' },
    onFilterChange: noop, onGenerate: noop, onClear: noop, loading: false,
    accounts, categories: [...expenseCategories, ...incomeCategories]
  })],

  ['ReportPreview (monthly)', () => h(ReportPreview, { report: monthlyReport })],
  ['ReportPreview (yearly)', () => h(ReportPreview, { report: yearlyReport })],
  ['ReportPreview (transactions)', () => h(ReportPreview, { report: transactionsReport })],
  ['ReportPreview (categories)', () => h(ReportPreview, { report: categoriesReport })],
  ['ReportPreview (budgets)', () => h(ReportPreview, { report: budgetsReport })],
  ['ReportPreview (accounts)', () => h(ReportPreview, { report: accountsReport })],
  ['ReportPreview (null renders nothing)', () => h(ReportPreview, { report: null })],

  ['ReportHistory (with entries)', () => h(ReportHistory, { history: historyEntries, loading: false, onRerun: noop })],
  ['ReportHistory (empty)', () => h(ReportHistory, { history: [], loading: false, onRerun: noop })],
  ['ReportHistory (loading)', () => h(ReportHistory, { history: [], loading: true, onRerun: noop })]
];

export function run() {
  globalThis.document = {
    body: {},
    documentElement: { style: {} },
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ style: {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) })
  };
  globalThis.window = {
    devicePixelRatio: 1,
    location: { search: '', href: 'http://localhost/' },
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' })
  };
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
    clear() {}
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

  const htmlOf = (name) => {
    const hit = results.find((r) => r.name === name);
    return hit && hit.ok ? hit.html : '';
  };
  const textOf = (name) => htmlOf(name).replace(/<!-- -->/g, '');

  const assert = [];
  const check = (name, condition, detail) => {
    assert.push({ name: name + (detail ? ' -- ' + detail : ''), ok: Boolean(condition) });
  };
  const containsAll = (html, needles) => needles.every((n) => html.indexOf(n) !== -1);

  // --- Reports page ----------------------------------------------------------
  const reportsHtml = htmlOf('Reports page (first render)');
  check('Reports page renders the heading', reportsHtml.indexOf('Reports') !== -1);
  check('Reports page shows the report type selector', reportsHtml.indexOf('Report Type') !== -1);
  check('Reports page shows quick presets', containsAll(reportsHtml, ['This Month', 'Last Month', 'This Year', 'Last Year', 'Custom Range']));
  check('Reports page shows the generate button', reportsHtml.indexOf('Generate Report') !== -1);
  check('Reports page shows the empty state', reportsHtml.indexOf('No financial data is available for the selected period.') !== -1);
  check('Reports page shows the history section', reportsHtml.indexOf('Report History') !== -1);

  // --- Filters ---------------------------------------------------------------
  const filtersHtml = htmlOf('ReportFilters (default)');
  check('Filters show date range inputs', containsAll(filtersHtml, ['From', 'To']));
  check('Filters show type filter', filtersHtml.indexOf('value="INCOME"') !== -1 && filtersHtml.indexOf('value="EXPENSE"') !== -1);
  check('Filters show account filter', filtersHtml.indexOf('All Accounts') !== -1);
  check('Filters show category filter', filtersHtml.indexOf('All Categories') !== -1);
  check('Filters show amount range', containsAll(filtersHtml, ['Min amount', 'Max amount']));

  const customFiltersHtml = htmlOf('ReportFilters (custom range active)');
  check('Custom range shows the resolved label', customFiltersHtml.indexOf('2026-01-01') !== -1 && customFiltersHtml.indexOf('2026-12-31') !== -1);

  // --- Preview: monthly ------------------------------------------------------
  const monthlyHtml = htmlOf('ReportPreview (monthly)');
  check('Monthly preview shows summary cards', containsAll(monthlyHtml, ['Income', 'Expenses', 'Net Savings', 'Savings Rate']));
  check('Monthly preview shows budget section', monthlyHtml.indexOf('Budget Summary') !== -1);
  check('Monthly preview shows top categories', monthlyHtml.indexOf('Top Spending Categories') !== -1);
  check('Monthly preview shows largest transactions', monthlyHtml.indexOf('Largest Transactions') !== -1);
  check('Monthly preview shows the period label', monthlyHtml.indexOf('September 2026') !== -1);

  // --- Preview: yearly -------------------------------------------------------
  const yearlyHtml = htmlOf('ReportPreview (yearly)');
  check('Yearly preview shows totals', containsAll(yearlyHtml, ['Total Income', 'Total Expenses', 'Total Savings']));
  check('Yearly preview shows averages', containsAll(yearlyHtml, ['Avg Monthly Income', 'Avg Monthly Expenses', 'Avg Monthly Savings']));
  check('Yearly preview shows monthly breakdown', yearlyHtml.indexOf('Monthly Breakdown') !== -1);
  check('Yearly preview shows all 12 months', (yearlyHtml.match(/Jan 2026|Feb 2026|Mar 2026|Apr 2026|May 2026|Jun 2026|Jul 2026|Aug 2026|Sep 2026|Oct 2026|Nov 2026|Dec 2026/g) || []).length === 12);

  // --- Preview: transactions -------------------------------------------------
  const txnsHtml = textOf('ReportPreview (transactions)');
  check('Transactions preview shows the count', txnsHtml.indexOf('Showing 2 of 2') !== -1);
  check('Transactions preview shows columns', containsAll(txnsHtml, ['Date', 'Description', 'Category', 'Account', 'Type', 'Amount', 'Notes']));
  check('Transactions preview shows data', containsAll(txnsHtml, ['Groceries', 'Salary']));

  // --- Preview: categories ---------------------------------------------------
  const catsHtml = textOf('ReportPreview (categories)');
  check('Categories preview shows total', catsHtml.indexOf('Total Expenses') !== -1);
  check('Categories preview shows data', containsAll(catsHtml, ['Food', 'Bills']));
  check('Categories preview shows percentage', catsHtml.indexOf('40%') !== -1 || catsHtml.indexOf('31.6%') !== -1);

  // --- Preview: budgets ------------------------------------------------------
  const budgetsHtml = htmlOf('ReportPreview (budgets)');
  check('Budgets preview shows totals', containsAll(budgetsHtml, ['Total Budget', 'Total Spent', 'Remaining']));
  check('Budgets preview shows status badge', budgetsHtml.indexOf('WARNING') !== -1);
  check('Budgets preview shows usage', budgetsHtml.indexOf('93.75%') !== -1);

  // --- Preview: accounts ----------------------------------------------------
  const accountsHtml = htmlOf('ReportPreview (accounts)');
  check('Accounts preview shows columns', containsAll(accountsHtml, ['Account', 'Current Balance', 'Total Income', 'Total Expenses', 'Number of Transactions', 'Transfers In', 'Transfers Out']));
  check('Accounts preview shows data', containsAll(accountsHtml, ['HDFC Bank', '45,000', '60,000', '15,000']));

  // --- Preview: null --------------------------------------------------------
  check('Null report renders nothing', htmlOf('ReportPreview (null renders nothing)') === '');

  // --- History ---------------------------------------------------------------
  const historyHtml = textOf('ReportHistory (with entries)');
  check('History shows entries', containsAll(historyHtml, ['Monthly', 'Transactions', 'CSV', 'Re-run']));
  check('History shows dates', historyHtml.indexOf('2026-09-01') !== -1 && historyHtml.indexOf('2026-09-30') !== -1);

  const emptyHistoryHtml = htmlOf('ReportHistory (empty)');
  check('Empty history shows a message', emptyHistoryHtml.indexOf('No reports generated yet') !== -1);

  // --- Navigation ------------------------------------------------------------
  const sidebarHtml = htmlOf('Sidebar (Reports entry)');
  check('Sidebar links Reports', sidebarHtml.indexOf('/reports') !== -1);

  const routeHtml = htmlOf('AppRoutes (/reports resolves to a real route)');
  check('Route /reports exists (no wildcard redirect)',
    routeHtml.length > 0 && routeHtml.indexOf('/login') === -1,
    'len=' + routeHtml.length);

  // --- Query layer -----------------------------------------------------------
  check('buildQuery drops empty values',
    buildQuery({ type: '', startDate: undefined, search: null }) === '');
  check('buildQuery keeps set values',
    buildQuery({ type: 'EXPENSE', page: 1, search: 'groceries' }) === '?type=EXPENSE&page=1&search=groceries',
    buildQuery({ type: 'EXPENSE', page: 1, search: 'groceries' }));

  // --- Formatters ------------------------------------------------------------
  check('formatMoney is currency aware', formatMoney(1234, 'INR').indexOf('1,234') !== -1,
    formatMoney(1234, 'INR'));
  check('formatMoney handles empty amounts', formatMoney(null) === '0');
  check('formatDate renders a readable date', formatDate('2026-09-20T10:00:00.000Z').length > 6);

  return { renders: results, checks: assert };
}
`;

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-smoke8-'));
  const entryPath = path.join(clientDir, '.phase8_smoke_entry.jsx');
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

  const routesSrc = fs.readFileSync(path.join(clientDir, 'src', 'routes', 'AppRoutes.jsx'), 'utf8');
  const pushSourceCheck = (name, ok, detail) => {
    checks.push({ name: name + (detail ? ' -- ' + detail : ''), ok: Boolean(ok) });
  };
  pushSourceCheck('Route /reports is registered',
    routesSrc.includes('<Route path="/reports"'));
  pushSourceCheck('No stale placeholder routes remain',
    !routesSrc.includes('Coming in Phase 3'));

  let failed = 0;
  console.log('=== PHASE 8 · FRONTEND SMOKE ===\n');
  console.log('Component renders');
  for (const r of renders) {
    if (r.ok) {
      console.log(`  ok   ${r.name}${r.len === 0 ? ' (renders nothing, as expected)' : ''}`);
    } else {
      failed += 1;
      console.log(`  FAIL ${r.name} -- ${r.error}`);
    }
  }

  console.log('\nContent + query layer');
  for (const c of checks) {
    if (c.ok) {
      console.log(`  ok   ${c.name}`);
    } else {
      failed += 1;
      console.log(`  FAIL ${c.name}`);
    }
  }

  console.log(`\n${renders.length + checks.length} checks, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
