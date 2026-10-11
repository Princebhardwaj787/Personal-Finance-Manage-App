/**
 * Phase 5 frontend smoke test.
 *
 * Bundles the real page/component modules with esbuild and renders them with
 * react-dom/server. This proves every page mounts without runtime errors
 * (unresolved imports, undefined components, broken JSX, bad prop access).
 *
 * Test-only accommodations because there is no DOM in Node:
 *  - a minimal `document` stub (Modal.jsx reads `document.body`)
 *  - an esbuild resolve shim that inlines `createPortal`, because React's
 *    server renderer rejects portals (error #200) before rendering them
 *  - Login/Register wrapped in MemoryRouter + AuthProvider, which is how
 *    they are rendered in the real app.
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
import { AuthProvider } from './src/contexts/AuthProvider';

import SavingsGoals from './src/pages/SavingsGoals';
import RecurringExpenses from './src/pages/RecurringExpenses';
import BudgetPage from './src/pages/BudgetPage';
import Dashboard from './src/pages/Dashboard';
import Accounts from './src/pages/Accounts';
import Categories from './src/pages/Categories';
import Transactions from './src/pages/Transactions';
import Login from './src/pages/Login';
import Register from './src/pages/Register';
import GoalCard from './src/components/savingsGoals/GoalCard';
import GoalFormModal from './src/components/savingsGoals/GoalFormModal';
import ContributionModal from './src/components/savingsGoals/ContributionModal';
import ContributionHistory from './src/components/savingsGoals/ContributionHistory';
import RecurringFormModal from './src/components/recurring/RecurringFormModal';
import Button from './src/components/forms/Button';
import EmptyState from './src/ui/EmptyState';
import ErrorState from './src/ui/ErrorState';

const goal = {
  id: 'g1', name: 'New Laptop', description: 'Savings for a new laptop',
  targetAmount: 80000, currentAmount: 15000, remainingAmount: 65000,
  percentageComplete: 18.75, targetDate: '2027-03-01', status: 'ACTIVE',
  contributionsCount: 1
};

const completedGoal = Object.assign({}, goal, {
  id: 'g2', name: 'Done', currentAmount: 80000, remainingAmount: 0,
  percentageComplete: 100, status: 'COMPLETED'
});

const archivedGoal = Object.assign({}, goal, { id: 'g3', name: 'Old', status: 'ARCHIVED' });

const recurring = {
  id: 'r1', name: 'Netflix', amount: 649, frequency: 'MONTHLY',
  frequencyLabel: 'month', monthlyAmount: 649, yearlyAmount: 7788,
  nextDueDate: '2026-10-05', daysUntilDue: 6, dueLabel: 'Due in 6 days',
  description: 'Netflix subscription', isActive: true,
  accountId: 'a1', categoryId: 'c1',
  account: { id: 'a1', name: 'Bank' }, category: { id: 'c1', name: 'Entertainment' }
};

const withProviders = (node) =>
  h(MemoryRouter, { initialEntries: ['/'] }, h(AuthProvider, null, node));

// Dashboard renders <Link>, so (exactly as in the real app, where main.jsx
// provides <BrowserRouter>) it must be rendered inside a Router.
const withRouter = (node) => h(MemoryRouter, { initialEntries: ['/dashboard'] }, null, node);

const cases = [
  ['SavingsGoals (empty state)', () => h(SavingsGoals)],
  ['RecurringExpenses (empty state)', () => h(RecurringExpenses)],
  ['BudgetPage', () => h(BudgetPage)],
  ['Dashboard', () => withRouter(h(Dashboard))],
  ['Accounts', () => h(Accounts)],
  ['Categories', () => h(Categories)],
  // The Phase 7 transactions page renders <Link> shortcuts (Transfers, etc.),
  // so it needs the router context it always has inside the real app.
  ['Transactions', () => withRouter(h(Transactions))],
  ['Login (in providers)', () => withProviders(h(Login))],
  ['Register (in providers)', () => withProviders(h(Register))],
  ['GoalCard ACTIVE', () => h(GoalCard, { goal, onAdd() {}, onEdit() {}, onDelete() {}, onHistory() {} })],
  ['GoalCard COMPLETED', () => h(GoalCard, { goal: completedGoal, onAdd() {}, onEdit() {}, onDelete() {}, onHistory() {} })],
  ['GoalCard ARCHIVED', () => h(GoalCard, { goal: archivedGoal, onAdd() {}, onEdit() {}, onDelete() {}, onHistory() {} })],
  ['GoalFormModal (create, open)', () => h(GoalFormModal, { open: true, onClose() {}, goal: null, onSubmit() {} })],
  ['GoalFormModal (edit, open)', () => h(GoalFormModal, { open: true, onClose() {}, goal, onSubmit() {} })],
  ['ContributionModal (open)', () => h(ContributionModal, { open: true, onClose() {}, goal, onSubmit() {} })],
  ['ContributionHistory (open, no goal yet)', () => h(ContributionHistory, { open: true, onClose() {}, goal })],
  ['RecurringFormModal (create, open)', () => h(RecurringFormModal, { open: true, onClose() {}, item: null, onSubmit() {} })],
  ['RecurringFormModal (edit, open)', () => h(RecurringFormModal, { open: true, onClose() {}, item: recurring, onSubmit() {} })],
  ['GoalFormModal (closed renders nothing)', () => h(GoalFormModal, { open: false, onClose() {}, goal: null, onSubmit() {} })],
  ['ContributionModal (closed renders nothing)', () => h(ContributionModal, { open: false, onClose() {}, goal, onSubmit() {} })],
  ['Button (loading state - used to crash)', () => h(Button, { loading: true }, 'Save')],
  ['Button (primary)', () => h(Button, { variant: 'primary' }, 'Save')],
  ['EmptyState (with form - used to crash)', () => h(EmptyState, { title: 'Nothing', description: 'Empty', showForm() {}, formTitle: 'Create' })],
  ['ErrorState (with retry)', () => h(ErrorState, { title: 'Oops', description: 'Error', onRetry() {} })]
];

export function run() {
  // Modal.jsx touches document.body when open; there is no DOM in Node, so a
  // minimal stub keeps the render path from throwing.
  globalThis.document = {
    body: {},
    addEventListener() {},
    removeEventListener() {}
  };

  const results = [];
  for (const [name, make] of cases) {
    try {
      const html = renderToString(make());
      results.push({ name, ok: typeof html === 'string', html, len: html.length });
    } catch (err) {
      const stack = (err && err.stack ? String(err.stack) : '').split('\\n').slice(0, 3).join(' | ');
      results.push({
        name,
        ok: false,
        error: typeof err + '/' + (err && err.name) + ': ' + (err && err.message) + ' >> ' + stack
      });
    }
  }
  return results;
}
`;

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-smoke-'));
  const entryPath = path.join(clientDir, '.phase5_smoke_entry.jsx');
  const outPath = path.join(tmp, 'bundle.cjs');

  fs.writeFileSync(entryPath, entry, 'utf8');
  // Modal.jsx is the only direct importer of 'react-dom' and it renders
  // through a portal. React's server renderer rejects portals (error #200),
  // so this shim inlines the modal's children for the SSR smoke test only.
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
  const results = run();

  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ok   ${r.name}${r.len === 0 ? ' (renders nothing, as expected)' : ''}`);
    } else {
      failed += 1;
      console.log(`  FAIL ${r.name} -- ${r.error}`);
    }
  }

  console.log(`\n=== FRONTEND SMOKE: ${results.length - failed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
