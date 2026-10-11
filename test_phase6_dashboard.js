/* Phase 6 — Dashboard: summary, budget overview, widgets, security.
   Run with the server on :3001 ->  node test_phase6_dashboard.js */
const http = require('http');

let passed = 0;
let failed = 0;

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: 'localhost', port: 3001, path, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let data = raw;
          try { data = JSON.parse(raw); } catch { /* keep raw */ }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.log(`  ✗ ${label} ${detail}`); }
}

const approx = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function register(email) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name: 'Phase 6 Tester' }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

/* --- deterministic calendar anchors (UTC) --- */
const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH = NOW.getUTCMonth() + 1; // 1-12
const LAST_DAY = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();
const MONTH_START = `${YEAR}-${pad(MONTH)}-01`;
const MONTH_END = `${YEAR}-${pad(MONTH)}-${pad(LAST_DAY)}`;
const PREV_MID = new Date(Date.UTC(YEAR, MONTH - 2, 15));
const PREV_DAY = `${PREV_MID.getUTCFullYear()}-${pad(PREV_MID.getUTCMonth() + 1)}-${pad(PREV_MID.getUTCDate())}`;

const INCOME_TOTAL = 50000;
const EXPENSES_THIS_MONTH = 7500 + 5000 + 3200 + 777; // 16477

async function run() {
  console.log('=== PHASE 6 · DASHBOARD ===\n');

  const token = await register(`p6_dashboard_${Date.now()}@example.com`);

  console.log('Security — unauthenticated');
  const protectedPaths = [
    '/api/dashboard/summary',
    '/api/dashboard/widgets',
    '/api/dashboard/budget-overview',
    '/api/analytics/income-expenses',
    '/api/analytics/category-spending',
    '/api/analytics/monthly-trends'
  ];
  for (const path of protectedPaths) {
    const res = await request('GET', path);
    check(`401 without token — ${path}`, res.status === 401, `got ${res.status}`);
  }

  console.log('\nEmpty state');
  const empty = await request('GET', '/api/dashboard/summary', { token });
  check('Summary 200', empty.status === 200, `got ${empty.status}`);
  check('savingsRate is null when income is 0 (not NaN/Infinity)',
    empty.data.savingsRate === null && empty.data.hasIncome === false,
    JSON.stringify({ savingsRate: empty.data.savingsRate, hasIncome: empty.data.hasIncome }));
  check('netSavings is 0 with no data', approx(empty.data.netSavings, 0), empty.data.netSavings);
  check('period block present with label',
    empty.data.period && typeof empty.data.period.label === 'string' &&
    typeof empty.data.period.start === 'string' && typeof empty.data.period.end === 'string',
    JSON.stringify(empty.data.period));

  const emptyBudget = await request('GET', '/api/dashboard/budget-overview', { token });
  check('Budget overview with no budgets -> NO_BUDGET',
    emptyBudget.status === 200 && emptyBudget.data.budgetCount === 0 &&
    emptyBudget.data.totals.status === 'NO_BUDGET',
    JSON.stringify(emptyBudget.data));
  check('No alerts invented when no budget exists',
    Array.isArray(emptyBudget.data.alerts) && emptyBudget.data.alerts.length === 0,
    JSON.stringify(emptyBudget.data.alerts));

  const emptyWidgets = await request('GET', '/api/dashboard/widgets', { token });
  check('Widgets 200', emptyWidgets.status === 200, `got ${emptyWidgets.status}`);
  check('Widgets empty for a new user',
    emptyWidgets.data.recentTransactions.length === 0 &&
    emptyWidgets.data.savingsGoals.length === 0 &&
    emptyWidgets.data.upcomingPayments.length === 0,
    JSON.stringify(emptyWidgets.data));

  console.log('\nSeed data');
  const account = await request('POST', '/api/accounts', {
    token, body: { name: 'P6 Bank', type: 'BANK', balance: 0, currency: 'INR', color: '#22c55e' }
  });
  const accountId = account.data.account?.id;
  check('Account created (201)', account.status === 201, JSON.stringify(account.data));

  const expenseCats = await request('GET', '/api/categories?type=EXPENSE', { token });
  const incomeCats = await request('GET', '/api/categories?type=INCOME', { token });
  const catByName = (list, name) => list.find((c) => c.name === name)?.id;
  const foodId = catByName(expenseCats.data.categories, 'Food & Dining');
  const shopId = catByName(expenseCats.data.categories, 'Shopping');
  const transportId = catByName(expenseCats.data.categories, 'Transport');
  const salaryId = catByName(incomeCats.data.categories, 'Salary');
  const freelanceId = catByName(incomeCats.data.categories, 'Freelance');
  check('Default categories available', Boolean(foodId && shopId && transportId && salaryId && freelanceId));

  const mkTxn = async (type, amount, description, date, categoryId) => {
    const res = await request('POST', '/api/transactions', {
      token, body: { type, amount, description, date, accountId, categoryId }
    });
    if (res.status !== 201) throw new Error(`txn ${description} failed: ${res.status} ${JSON.stringify(res.data)}`);
    return res.data;
  };

  await mkTxn('INCOME', INCOME_TOTAL, 'Salary', `${MONTH_START}T12:00:00.000Z`, salaryId);
  await mkTxn('EXPENSE', 7500, 'Groceries', `${YEAR}-${pad(MONTH)}-02T10:00:00.000Z`, foodId);
  await mkTxn('EXPENSE', 5000, 'New shoes', `${YEAR}-${pad(MONTH)}-03T10:00:00.000Z`, shopId);
  await mkTxn('EXPENSE', 3200, 'Metro card', `${YEAR}-${pad(MONTH)}-04T10:00:00.000Z`, transportId);
  // LAST DAY OF MONTH at 18:00 — the exact case the old `lte: midnight` filter dropped.
  await mkTxn('EXPENSE', 777, 'Month end shop', `${YEAR}-${pad(MONTH)}-${pad(LAST_DAY)}T18:00:00.000Z`, foodId);
  await mkTxn('INCOME', 10000, 'Freelance', `${PREV_DAY}T12:00:00.000Z`, freelanceId);

  console.log('\nFinancial summary (this month)');
  const summary = await request('GET', '/api/dashboard/summary?period=this_month', { token });
  check('Summary 200', summary.status === 200, `got ${summary.status}`);
  check('Total balance = account balance (point-in-time, not period-scoped)',
    approx(summary.data.totalBalance, INCOME_TOTAL + 10000 - EXPENSES_THIS_MONTH),
    summary.data.totalBalance);
  check('Income = 50000', approx(summary.data.totalIncome, 50000), summary.data.totalIncome);
  check('Expenses = 16477 (last-day transaction included)',
    approx(summary.data.totalExpenses, EXPENSES_THIS_MONTH), summary.data.totalExpenses);
  check('Savings (net) = Income - Expenses',
    approx(summary.data.netSavings, summary.data.totalIncome - summary.data.totalExpenses),
    `${summary.data.netSavings} vs ${summary.data.totalIncome - summary.data.totalExpenses}`);
  check('Savings rate correct',
    approx(summary.data.savingsRate,
      round2((summary.data.netSavings / summary.data.totalIncome) * 100)),
    summary.data.savingsRate);
  check('Savings rate between -Infinity..Infinity (finite)',
    Number.isFinite(summary.data.savingsRate), summary.data.savingsRate);
  check('period.start is the 1st of the month',
    summary.data.period.start.startsWith(MONTH_START), summary.data.period.start);
  check('period.end is exclusive first-of-next-month',
    summary.data.period.end > summary.data.period.start, summary.data.period.end);

  console.log('\nPeriod selection');
  const lastMonth = await request('GET', '/api/dashboard/summary?period=last_month', { token });
  check('Last month income = 10000', approx(lastMonth.data.totalIncome, 10000), lastMonth.data.totalIncome);
  check('Last month expenses = 0', approx(lastMonth.data.totalExpenses, 0), lastMonth.data.totalExpenses);
  check('Last month savings rate = 100', approx(lastMonth.data.savingsRate, 100), lastMonth.data.savingsRate);

  const three = await request('GET', '/api/dashboard/summary?period=last_3_months', { token });
  check('Last 3 months income = 60000', approx(three.data.totalIncome, 60000), three.data.totalIncome);
  check('Last 3 months expenses = 16477', approx(three.data.totalExpenses, EXPENSES_THIS_MONTH),
    three.data.totalExpenses);

  const six = await request('GET', '/api/dashboard/summary?period=last_6_months', { token });
  check('Last 6 months includes all seeded data (200)',
    six.status === 200 && approx(six.data.totalIncome, 60000), JSON.stringify(six.data.period));

  const year = await request('GET', '/api/dashboard/summary?period=this_year', { token });
  check('This year 200 + starts Jan 1',
    year.status === 200 && year.data.period.start.startsWith(`${YEAR}-01-01`),
    JSON.stringify(year.data.period));

  const custom = await request('GET',
    `/api/dashboard/summary?period=custom&startDate=${MONTH_START}&endDate=${MONTH_END}`, { token });
  check('Custom range 200', custom.status === 200, `got ${custom.status}`);
  check('Custom range captures the last day of the month',
    approx(custom.data.totalExpenses, EXPENSES_THIS_MONTH), custom.data.totalExpenses);

  const incomeOnly = await request('GET',
    `/api/dashboard/summary?period=custom&startDate=${MONTH_START}&endDate=${YEAR}-${pad(MONTH)}-01`, { token });
  check('Income-only range: income 50000, expenses 0',
    approx(incomeOnly.data.totalIncome, 50000) && approx(incomeOnly.data.totalExpenses, 0),
    JSON.stringify(incomeOnly.data));
  check('Income-only savings rate = 100', approx(incomeOnly.data.savingsRate, 100),
    incomeOnly.data.savingsRate);

  const prevOnly = await request('GET',
    `/api/dashboard/summary?period=custom&startDate=${PREV_DAY}&endDate=${PREV_DAY}`, { token });
  check('Expense-free custom range yields rate 100',
    approx(prevOnly.data.totalExpenses, 0) && approx(prevOnly.data.savingsRate, 100),
    JSON.stringify(prevOnly.data));

  console.log('\nValidation');
  const badOrder = await request('GET',
    `/api/dashboard/summary?period=custom&startDate=${MONTH_END}&endDate=${MONTH_START}`, { token });
  check('startDate > endDate rejected (400)', badOrder.status === 400, `got ${badOrder.status}`);

  const noDates = await request('GET', '/api/dashboard/summary?period=custom', { token });
  check('Custom range without dates rejected (400)', noDates.status === 400, `got ${noDates.status}`);

  const badPeriod = await request('GET', '/api/dashboard/summary?period=forever', { token });
  check('Unknown period rejected (400)', badPeriod.status === 400, `got ${badPeriod.status}`);

  console.log('\nBudgets');
  const mkBudget = async (categoryId, amount) => {
    const res = await request('POST', '/api/budgets', {
      token, body: { categoryId, amount, month: MONTH, year: YEAR }
    });
    return res;
  };
  const foodBudget = await mkBudget(foodId, 8000);
  check('Budget creation succeeds (201) — regression for missing `name`',
    foodBudget.status === 201, `${foodBudget.status} ${JSON.stringify(foodBudget.data)}`);
  const shopBudget = await mkBudget(shopId, 4000);
  check('Second budget created (201)', shopBudget.status === 201, JSON.stringify(shopBudget.data));
  const transportBudget = await mkBudget(transportId, 10000);
  check('Third budget created (201)', transportBudget.status === 201, JSON.stringify(transportBudget.data));

  const duplicate = await mkBudget(foodId, 9000);
  check('Duplicate budget rejected (400)', duplicate.status === 400, `got ${duplicate.status}`);

  const overview = await request('GET', `/api/dashboard/budget-overview?month=${MONTH}&year=${YEAR}`, { token });
  check('Budget overview 200', overview.status === 200, `got ${overview.status}`);
  check('budgetCount = 3', overview.data.budgetCount === 3, overview.data.budgetCount);
  check('Total budgeted = 22000', approx(overview.data.totals.totalBudget, 22000),
    overview.data.totals.totalBudget);
  check('Total spent includes the last day of the month',
    approx(overview.data.totals.totalSpent, EXPENSES_THIS_MONTH),
    overview.data.totals.totalSpent);
  check('Remaining = budgeted - spent',
    approx(overview.data.totals.remainingAmount, 22000 - EXPENSES_THIS_MONTH),
    overview.data.totals.remainingAmount);
  check('Usage % correct',
    approx(overview.data.totals.usagePercent,
      round2((EXPENSES_THIS_MONTH / 22000) * 100)), overview.data.totals.usagePercent);

  const byName = Object.fromEntries(overview.data.budgets.map((b) => [b.category.name, b]));
  check('Exceeded budget identified (Food 8277/8000)',
    byName['Food & Dining'].status === 'EXCEEDED' && byName['Food & Dining'].remainingAmount < 0,
    JSON.stringify(byName['Food & Dining']));
  check('Exceeded budget identified (Shopping 5000/4000)',
    byName['Shopping'].status === 'EXCEEDED' &&
    approx(byName['Shopping'].remainingAmount, -1000),
    JSON.stringify(byName['Shopping']));
  check('Healthy budget identified (Transport 3200/10000)',
    byName['Transport'].status === 'ON_TRACK' && approx(byName['Transport'].remainingAmount, 6800),
    JSON.stringify(byName['Transport']));
  check('Alerts only for WARNING/EXCEEDED budgets (2 of 3)',
    overview.data.alerts.length === 2 &&
    overview.data.alerts.every((a) => a.status === 'EXCEEDED' || a.status === 'WARNING'),
    JSON.stringify(overview.data.alerts));
  check('Alerts carry numeric detail for descriptive copy',
    overview.data.alerts.every((a) =>
      typeof a.percentageUsed === 'number' && typeof a.remainingAmount === 'number'),
    JSON.stringify(overview.data.alerts));
  check('Totals status is ON_TRACK for 74.9% usage',
    overview.data.totals.status === 'ON_TRACK', overview.data.totals.status);

  const viaPeriod = await request('GET',
    `/api/dashboard/budget-overview?period=custom&startDate=${MONTH_START}&endDate=${MONTH_END}`, { token });
  check('Budget month derived from period end date',
    viaPeriod.data.month === MONTH && viaPeriod.data.year === YEAR &&
    approx(viaPeriod.data.totals.totalSpent, EXPENSES_THIS_MONTH),
    JSON.stringify(viaPeriod.data.totals));

  const quietMonth = await request('GET', '/api/dashboard/budget-overview?month=1&year=2021', { token });
  check('Month without budgets -> NO_BUDGET, no alerts',
    quietMonth.data.budgetCount === 0 && quietMonth.data.totals.status === 'NO_BUDGET' &&
    quietMonth.data.alerts.length === 0,
    JSON.stringify(quietMonth.data.totals));

  const listBudgets = await request('GET', `/api/budgets?month=${MONTH}&year=${YEAR}`, { token });
  check('Budget list with month/year filter (Phase 4 regression)',
    listBudgets.status === 200 && listBudgets.data.budgets.length === 3,
    JSON.stringify(listBudgets.data));

  const listAllBudgets = await request('GET', '/api/budgets', { token });
  check('Budget list without filters works (regression: invalid orderBy)',
    listAllBudgets.status === 200 && listAllBudgets.data.budgets.length === 3,
    JSON.stringify(listAllBudgets.data));

  const currentMonthBudgets = await request('GET', '/api/budgets/current-month', { token });
  check('Current-month budgets endpoint still works',
    currentMonthBudgets.status === 200 && Array.isArray(currentMonthBudgets.data.budgets),
    JSON.stringify(currentMonthBudgets.data));

  console.log('\nDate range fix on the transactions list');
  const inRange = await request('GET',
    `/api/transactions?startDate=${MONTH_START}&endDate=${MONTH_END}&limit=100`, { token });
  const descriptions = (inRange.data.transactions || []).map((t) => t.description);
  check('Last day of the month is included by endDate filter',
    inRange.status === 200 && descriptions.includes('Month end shop'),
    JSON.stringify(descriptions));

  console.log('\nWidgets');
  const goal = await request('POST', '/api/savings-goals', {
    token, body: { name: 'Widget Goal', targetAmount: 80000, currentAmount: 32000, targetDate: isoIn(90) }
  });
  check('Seed savings goal (201)', goal.status === 201, JSON.stringify(goal.data));

  const archivedGoal = await request('POST', '/api/savings-goals', {
    token, body: { name: 'Archived Goal', targetAmount: 10000, currentAmount: 1000, targetDate: isoIn(60) }
  });
  const archiveRes = await request('PUT', `/api/savings-goals/${archivedGoal.data.goal.id}`,
    { token, body: { status: 'ARCHIVED' } });
  check('Goal archived (200)', archiveRes.status === 200, JSON.stringify(archiveRes.data));

  const recurringSeed = async (name, days, isActive) => {
    const res = await request('POST', '/api/recurring-expenses', {
      token,
      body: { name, amount: 1000, frequency: 'MONTHLY', nextDueDate: isoIn(days), accountId, categoryId: foodId, isActive }
    });
    if (res.status !== 201) throw new Error(`recurring ${name} failed: ${res.status} ${JSON.stringify(res.data)}`);
    return res.data;
  };
  await recurringSeed('Gym', 3, true);
  await recurringSeed('Streaming', 10, true);
  await recurringSeed('Paused club', 2, false);

  const widgets = await request('GET', '/api/dashboard/widgets', { token });
  check('Widgets 200', widgets.status === 200, `got ${widgets.status}`);
  check('Recent transactions present and newest first',
    widgets.data.recentTransactions.length > 0 &&
    widgets.data.recentTransactions[0].description === 'Month end shop',
    JSON.stringify(widgets.data.recentTransactions[0]));
  check('Recent transactions capped (<= 8)',
    widgets.data.recentTransactions.length <= 8, widgets.data.recentTransactions.length);
  check('Only ACTIVE savings goals shown',
    widgets.data.savingsGoals.length === 1 &&
    widgets.data.savingsGoals[0].name === 'Widget Goal',
    JSON.stringify(widgets.data.savingsGoals.map((g) => g.name)));
  check('Goal progress derived (40%)',
    approx(widgets.data.savingsGoals[0].percentageComplete, 40),
    widgets.data.savingsGoals[0].percentageComplete);
  check('Archived goal excluded from total',
    widgets.data.savingsGoalsTotal === 1, widgets.data.savingsGoalsTotal);
  check('Inactive recurring expense excluded',
    !widgets.data.upcomingPayments.some((p) => p.name === 'Paused club'),
    JSON.stringify(widgets.data.upcomingPayments.map((p) => p.name)));
  check('Upcoming payments sorted by next due date',
    widgets.data.upcomingPayments.length === 2 &&
    widgets.data.upcomingPayments[0].name === 'Gym' &&
    widgets.data.upcomingPayments[1].name === 'Streaming',
    JSON.stringify(widgets.data.upcomingPayments.map((p) => p.name)));
  check('Upcoming payment has a human due label',
    typeof widgets.data.upcomingPayments[0].dueLabel === 'string',
    JSON.stringify(widgets.data.upcomingPayments[0]));
  check('Activity counters returned', widgets.data.activity.transactionCount === 6,
    JSON.stringify(widgets.data.activity));

  console.log('\nIsolation (User A vs User B)');
  const other = await register(`p6_dashboard_other_${Date.now()}@example.com`);

  const otherSummary = await request('GET',
    `/api/dashboard/summary?period=custom&startDate=${MONTH_START}&endDate=${MONTH_END}`,
    { token: other });
  check("User B sees zero balance (no account access)",
    approx(otherSummary.data.totalBalance, 0), otherSummary.data.totalBalance);
  check("User B sees zero income/expenses despite matching date filters",
    approx(otherSummary.data.totalIncome, 0) && approx(otherSummary.data.totalExpenses, 0),
    JSON.stringify({ i: otherSummary.data.totalIncome, e: otherSummary.data.totalExpenses }));
  check("User B sees no savings goals", otherSummary.data.savings.activeCount === 0,
    JSON.stringify(otherSummary.data.savings));

  const otherBudget = await request('GET',
    `/api/dashboard/budget-overview?month=${MONTH}&year=${YEAR}`, { token: other });
  check("User B sees no budgets", otherBudget.data.budgetCount === 0, JSON.stringify(otherBudget.data));

  const otherWidgets = await request('GET', '/api/dashboard/widgets', { token: other });
  check("User B sees no widgets",
    otherWidgets.data.recentTransactions.length === 0 &&
    otherWidgets.data.savingsGoals.length === 0 &&
    otherWidgets.data.upcomingPayments.length === 0,
    JSON.stringify(otherWidgets.data));

  const otherTrend = await request('GET', '/api/analytics/income-expenses?period=this_month', { token: other });
  check("User B's trend is all zeros",
    otherTrend.status === 200 && otherTrend.data.totals.income === 0 &&
    otherTrend.data.totals.expense === 0,
    JSON.stringify(otherTrend.data.totals));

  const otherCategories = await request('GET', '/api/analytics/category-spending?period=this_month', { token: other });
  check("User B has no category spending",
    otherCategories.status === 200 && otherCategories.data.hasExpenses === false,
    JSON.stringify(otherCategories.data));

  const otherTrends = await request('GET', '/api/analytics/monthly-trends?months=6', { token: other });
  check("User B's monthly trend is all zeros",
    otherTrends.status === 200 &&
    otherTrends.data.months.every((m) => m.income === 0 && m.expense === 0),
    JSON.stringify(otherTrends.data.totals));

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
