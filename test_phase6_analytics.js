/* Phase 6 — Analytics: income/expense trend, category spending, monthly trends.
   Run with the server on :3001 ->  node test_phase6_analytics.js */
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
const pad = (n) => String(n).padStart(2, '0');

async function register(email) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name: 'Analytics Tester' }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

async function seedUser(token) {
  const account = await request('POST', '/api/accounts', {
    token, body: { name: 'Analytics Bank', type: 'BANK', balance: 0, currency: 'INR', color: '#22c55e' }
  });
  const accountId = account.data.account?.id;
  const expenses = await request('GET', '/api/categories?type=EXPENSE', { token });
  const incomes = await request('GET', '/api/categories?type=INCOME', { token });
  const cat = (list, name) => list.find((c) => c.name === name)?.id;

  return {
    accountId,
    food: cat(expenses.data.categories, 'Food & Dining'),
    shopping: cat(expenses.data.categories, 'Shopping'),
    transport: cat(expenses.data.categories, 'Transport'),
    salary: cat(incomes.data.categories, 'Salary'),
    freelance: cat(incomes.data.categories, 'Freelance')
  };
}

async function txn(token, accountId, type, amount, description, date, categoryId) {
  const res = await request('POST', '/api/transactions', {
    token,
    body: { type, amount, description, date, accountId, ...(categoryId ? { categoryId } : {}) }
  });
  if (res.status !== 201) {
    throw new Error(`txn ${description} failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH = NOW.getUTCMonth() + 1;
const LAST_DAY = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();
const MONTH_START = `${YEAR}-${pad(MONTH)}-01`;
const MONTH_END = `${YEAR}-${pad(MONTH)}-${pad(LAST_DAY)}`;

const PREV = new Date(Date.UTC(YEAR, MONTH - 2, 15));
const PREV_M = `${PREV.getUTCFullYear()}-${pad(PREV.getUTCMonth() + 1)}`;
const PREV_DAY = `${PREV_M}-${pad(PREV.getUTCDate())}`;
const PREV_MONTH_LAST = new Date(Date.UTC(PREV.getUTCFullYear(), PREV.getUTCMonth() + 1, 0)).getUTCDate();
const PREV_MONTH_START = `${PREV_M}-01`;
const PREV_MONTH_END = `${PREV_M}-${pad(PREV_MONTH_LAST)}`;

async function run() {
  console.log('=== PHASE 6 · ANALYTICS ===\n');

  console.log('Security');
  const anon = await register(`p6_anon_${Date.now()}@example.com`);
  for (const path of [
    '/api/analytics/income-expenses',
    '/api/analytics/category-spending',
    '/api/analytics/monthly-trends'
  ]) {
    const res = await request('GET', path);
    check(`401 without token — ${path}`, res.status === 401, `got ${res.status}`);
  }

  console.log('\nEmpty state');
  const emptyTrend = await request('GET', '/api/analytics/income-expenses?period=this_month', { token: anon });
  check('Trend 200 with no data', emptyTrend.status === 200, `got ${emptyTrend.status}`);
  check('Zero totals with no data',
    emptyTrend.data.totals.income === 0 && emptyTrend.data.totals.expense === 0 &&
    emptyTrend.data.totals.net === 0,
    JSON.stringify(emptyTrend.data.totals));
  check('Buckets still returned (no empty-looking chart)',
    Array.isArray(emptyTrend.data.buckets) && emptyTrend.data.buckets.length > 0,
    JSON.stringify(emptyTrend.data.buckets));
  check('All buckets are zero with no data',
    emptyTrend.data.buckets.every((b) => b.income === 0 && b.expense === 0),
    JSON.stringify(emptyTrend.data.buckets));

  const emptyCats = await request('GET', '/api/analytics/category-spending?period=this_month', { token: anon });
  check('hasExpenses false with no expense data',
    emptyCats.status === 200 && emptyCats.data.hasExpenses === false &&
    emptyCats.data.categories.length === 0,
    JSON.stringify(emptyCats.data));

  const emptyTrends = await request('GET', '/api/analytics/monthly-trends', { token: anon });
  check('Monthly trend defaults to 12 months',
    emptyTrends.status === 200 && emptyTrends.data.months.length === 12,
    JSON.stringify(emptyTrends.data.months?.length));

  /* ---------------- main seeded user ---------------- */
  console.log('\nSeed data');
  const token = await register(`p6_analytics_${Date.now()}@example.com`);
  const ids = await seedUser(token);

  await txn(token, ids.accountId, 'INCOME', 50000, 'Salary', `${MONTH_START}T12:00:00.000Z`, ids.salary);
  await txn(token, ids.accountId, 'EXPENSE', 7500, 'Groceries', `${YEAR}-${pad(MONTH)}-02T10:00:00.000Z`, ids.food);
  await txn(token, ids.accountId, 'EXPENSE', 5000, 'Shoes', `${YEAR}-${pad(MONTH)}-03T10:00:00.000Z`, ids.shopping);
  await txn(token, ids.accountId, 'EXPENSE', 3200, 'Metro', `${YEAR}-${pad(MONTH)}-04T10:00:00.000Z`, ids.transport);
  await txn(token, ids.accountId, 'EXPENSE', 777, 'Month end', `${YEAR}-${pad(MONTH)}-${pad(LAST_DAY)}T18:00:00.000Z`, ids.food);
  await txn(token, ids.accountId, 'INCOME', 10000, 'Freelance', `${PREV_DAY}T12:00:00.000Z`, ids.freelance);
  await txn(token, ids.accountId, 'EXPENSE', 4000, 'Dinner out', `${PREV_MONTH_START}T10:00:00.000Z`, ids.food);
  await txn(token, ids.accountId, 'EXPENSE', 250, 'Uncategorised taxi', `${YEAR}-${pad(MONTH)}-05T10:00:00.000Z`);

  console.log('\nIncome vs expense trend');
  const trend = await request('GET', '/api/analytics/income-expenses?period=this_month', { token });
  check('Trend 200', trend.status === 200, `got ${trend.status}`);
  check('Default granularity is week for a single month',
    trend.data.granularity === 'week', trend.data.granularity);
  check('This-month income = 50000', approx(trend.data.totals.income, 50000), trend.data.totals.income);
  check('This-month expense = 16727', approx(trend.data.totals.expense, 16477 + 250),
    trend.data.totals.expense);
  check('net = income - expense',
    approx(trend.data.totals.net, trend.data.totals.income - trend.data.totals.expense),
    JSON.stringify(trend.data.totals));
  check('Buckets sum to the totals',
    approx(trend.data.buckets.reduce((s, b) => s + b.income, 0), trend.data.totals.income) &&
    approx(trend.data.buckets.reduce((s, b) => s + b.expense, 0), trend.data.totals.expense),
    JSON.stringify(trend.data.buckets));
  check('Buckets are contiguous (no gaps, no overlaps)',
    trend.data.buckets.every((b, i) => i === 0 || b.start === trend.data.buckets[i - 1].end),
    JSON.stringify(trend.data.buckets.map((b) => [b.start, b.end])));
  check('Buckets cover the whole period',
    trend.data.buckets[0].start === trend.data.period.start &&
    trend.data.buckets[trend.data.buckets.length - 1].end === trend.data.period.end,
    JSON.stringify([trend.data.buckets[0]?.start, trend.data.period.end]));

  const byDay = await request('GET',
    '/api/analytics/income-expenses?period=this_month&granularity=day', { token });
  check('granularity=day returns one bucket per day',
    byDay.data.granularity === 'day' && byDay.data.buckets.length === (LAST_DAY),
    JSON.stringify({ g: byDay.data.granularity, n: byDay.data.buckets.length, LAST_DAY }));

  const byMonth = await request('GET',
    '/api/analytics/income-expenses?period=this_month&granularity=month', { token });
  check('granularity=month collapses to a single bucket',
    byMonth.data.buckets.length === 1 && approx(byMonth.data.buckets[0].expense, 16727),
    JSON.stringify(byMonth.data.buckets));

  const lastMonthTrend = await request('GET',
    '/api/analytics/income-expenses?period=last_month&granularity=month', { token });
  check('Previous month isolated (income 10000, expense 4000)',
    approx(lastMonthTrend.data.totals.income, 10000) && approx(lastMonthTrend.data.totals.expense, 4000),
    JSON.stringify(lastMonthTrend.data.totals));

  const customMulti = await request('GET',
    `/api/analytics/income-expenses?period=custom&startDate=${PREV_MONTH_START}&endDate=${MONTH_END}&granularity=month`,
    { token });
  check('Custom range spanning two months -> 2 buckets',
    customMulti.data.buckets.length === 2, JSON.stringify(customMulti.data.buckets.map((b) => b.key)));
  check('Two-month totals correct (income 60000, expense 20727)',
    approx(customMulti.data.totals.income, 60000) && approx(customMulti.data.totals.expense, 4000 + 16727),
    JSON.stringify(customMulti.data.totals));

  const incomeOnly = await request('GET',
    `/api/analytics/income-expenses?period=custom&startDate=${MONTH_START}&endDate=${MONTH_START}`,
    { token });
  check('Income-only period: expense 0, income 50000',
    approx(incomeOnly.data.totals.income, 50000) && approx(incomeOnly.data.totals.expense, 0),
    JSON.stringify(incomeOnly.data.totals));

  const expenseOnly = await request('GET',
    `/api/analytics/income-expenses?period=custom&startDate=${YEAR}-${pad(MONTH)}-03&endDate=${YEAR}-${pad(MONTH)}-03`,
    { token });
  check('Expense-only period: income 0, expense 5000',
    approx(expenseOnly.data.totals.income, 0) && approx(expenseOnly.data.totals.expense, 5000),
    JSON.stringify(expenseOnly.data.totals));

  const quietRange = await request('GET',
    '/api/analytics/income-expenses?period=custom&startDate=2021-03-01&endDate=2021-03-31', { token });
  check('Period with no data returns zeroed buckets',
    quietRange.status === 200 && quietRange.data.totals.income === 0 &&
    quietRange.data.totals.expense === 0 && quietRange.data.buckets.length > 0,
    JSON.stringify(quietRange.data.totals));

  console.log('\nValidation');
  const badGranularity = await request('GET',
    '/api/analytics/income-expenses?period=this_month&granularity=hour', { token });
  check('Invalid granularity rejected (400)', badGranularity.status === 400, `got ${badGranularity.status}`);

  const badPeriod = await request('GET', '/api/analytics/income-expenses?period=decade', { token });
  check('Invalid period rejected (400)', badPeriod.status === 400, `got ${badPeriod.status}`);

  const badRange = await request('GET',
    '/api/analytics/category-spending?period=custom&startDate=2026-05-10&endDate=2026-05-01', { token });
  check('Backwards date range rejected (400)', badRange.status === 400, `got ${badRange.status}`);

  const tooWide = await request('GET',
    '/api/analytics/category-spending?period=custom&startDate=2015-01-01&endDate=2026-01-01', { token });
  check('Range wider than 3 years rejected (400)', tooWide.status === 400, `got ${tooWide.status}`);

  const badMonths = await request('GET', '/api/analytics/monthly-trends?months=3', { token });
  check('months=3 rejected (400)', badMonths.status === 400, `got ${badMonths.status}`);

  const badMonthsHigh = await request('GET', '/api/analytics/monthly-trends?months=99', { token });
  check('months=99 rejected (400)', badMonthsHigh.status === 400, `got ${badMonthsHigh.status}`);

  console.log('\nSpending by category');
  const cats = await request('GET', '/api/analytics/category-spending?period=this_month', { token });
  check('Category spending 200', cats.status === 200, `got ${cats.status}`);
  check('Total expenses = 16727', approx(cats.data.totalExpenses, 16727), cats.data.totalExpenses);
  check('hasExpenses true', cats.data.hasExpenses === true);

  const names = cats.data.categories.map((c) => c.name);
  check('Grouped correctly (Food, Shopping, Transport, Uncategorized)',
    names.includes('Food & Dining') && names.includes('Shopping') &&
    names.includes('Transport') && names.includes('Uncategorized'),
    JSON.stringify(names));
  check('Uncategorised expense grouped under Uncategorized',
    names.filter((n) => n === 'Uncategorized').length === 1 &&
    approx(cats.data.categories.find((c) => c.name === 'Uncategorized').amount, 250),
    JSON.stringify(cats.data.categories));

  const food = cats.data.categories.find((c) => c.name === 'Food & Dining');
  check('Food total = 8277 across 2 transactions',
    approx(food.amount, 8277) && food.count === 2, JSON.stringify(food));

  const amounts = cats.data.categories.map((c) => c.amount);
  const sortedDesc = amounts.every((v, i) => i === 0 || amounts[i - 1] >= v);
  check('Sorted by amount descending', sortedDesc, JSON.stringify(amounts));
  check('Share percentages sum to ~100',
    Math.abs(cats.data.categories.reduce((s, c) => s + c.sharePercent, 0) - 100) < 0.5,
    JSON.stringify(cats.data.categories.map((c) => c.sharePercent)));
  check('topCategories capped at 5', cats.data.topCategories.length <= 5,
    cats.data.topCategories.length);
  check('topCategories starts with the biggest category',
    cats.data.topCategories[0].name === 'Food & Dining',
    JSON.stringify(cats.data.topCategories[0]));

  const catGrouping = await request('GET',
    `/api/analytics/category-spending?period=custom&startDate=${PREV_MONTH_START}&endDate=${PREV_MONTH_END}`,
    { token });
  check('Previous month categories differ (Food only = 4000)',
    catGrouping.data.categories.length === 1 &&
    approx(catGrouping.data.categories[0].amount, 4000),
    JSON.stringify(catGrouping.data.categories));

  const noExpenseCats = await request('GET',
    '/api/analytics/category-spending?period=custom&startDate=2021-03-01&endDate=2021-03-31', { token });
  check('Category chart empty state for a quiet period',
    noExpenseCats.data.hasExpenses === false && noExpenseCats.data.totalExpenses === 0 &&
    noExpenseCats.data.categories.length === 0,
    JSON.stringify(noExpenseCats.data));

  console.log('\nMonthly trends');
  const trends = await request('GET', '/api/analytics/monthly-trends?months=12', { token });
  check('Monthly trend 200', trends.status === 200, `got ${trends.status}`);
  check('12 buckets returned', trends.data.months.length === 12, trends.data.months.length);
  check('Buckets ordered oldest -> newest',
    trends.data.months.every((m, i) => i === 0 || m.key > trends.data.months[i - 1].key),
    JSON.stringify(trends.data.months.map((m) => m.key)));
  check('Last bucket is the current month',
    trends.data.months[11].key === `${YEAR}-${pad(MONTH)}`,
    trends.data.months[11].key);
  check('Each bucket carries a human label',
    trends.data.months.every((m) => typeof m.label === 'string' && m.label.length > 0),
    JSON.stringify(trends.data.months[0]));

  const currentBucket = trends.data.months.find((m) => m.key === `${YEAR}-${pad(MONTH)}`);
  check('Current month bucket matches the trend endpoint',
    approx(currentBucket.income, 50000) && approx(currentBucket.expense, 16727),
    JSON.stringify(currentBucket));

  const prevBucket = trends.data.months.find((m) => m.key === PREV_M);
  check('Previous month bucket isolated (10000 / 4000)',
    prevBucket && approx(prevBucket.income, 10000) && approx(prevBucket.expense, 4000),
    JSON.stringify(prevBucket));

  check('Bucket sums equal the returned totals',
    approx(trends.data.months.reduce((s, m) => s + m.income, 0), trends.data.totals.income) &&
    approx(trends.data.months.reduce((s, m) => s + m.expense, 0), trends.data.totals.expense),
    JSON.stringify(trends.data.totals));
  check('Trend totals include savings rate',
    typeof trends.data.totals.savingsRate === 'number' &&
    approx(trends.data.totals.savingsRate,
      Math.round((trends.data.totals.net / trends.data.totals.income) * 10000) / 100),
    JSON.stringify(trends.data.totals));

  const six = await request('GET', '/api/analytics/monthly-trends?months=6', { token });
  check('months=6 returns 6 buckets ending this month',
    six.data.months.length === 6 && six.data.months[5].key === `${YEAR}-${pad(MONTH)}`,
    JSON.stringify(six.data.months.map((m) => m.key)));

  console.log('\nIsolation');
  const other = await register(`p6_analytics_other_${Date.now()}@example.com`);
  const otherCats = await request('GET',
    `/api/analytics/category-spending?period=custom&startDate=${MONTH_START}&endDate=${MONTH_END}`,
    { token: other });
  check('Date filters cannot bypass ownership',
    otherCats.status === 200 && otherCats.data.totalExpenses === 0 &&
    otherCats.data.hasExpenses === false,
    JSON.stringify(otherCats.data));
  const otherTrend = await request('GET',
    `/api/analytics/income-expenses?period=custom&startDate=${MONTH_START}&endDate=${MONTH_END}`,
    { token: other });
  check('Another user cannot see this user\'s trend',
    otherTrend.data.totals.income === 0 && otherTrend.data.totals.expense === 0,
    JSON.stringify(otherTrend.data.totals));

  console.log('\nBoundary user: month / year / leap-year edges');
  const bt = await register(`p6_boundary_${Date.now()}@example.com`);
  const bIds = await seedUser(bt);

  // Year boundary: Dec of previous year vs Jan of this year
  await txn(bt, bIds.accountId, 'INCOME', 4000, 'December income', `${YEAR - 1}-12-20T12:00:00.000Z`, bIds.salary);
  await txn(bt, bIds.accountId, 'INCOME', 6000, 'January income', `${YEAR}-01-05T12:00:00.000Z`, bIds.salary);
  // Leap day
  await txn(bt, bIds.accountId, 'INCOME', 1000, 'Leap income', '2024-02-29T12:00:00.000Z', bIds.salary);
  await txn(bt, bIds.accountId, 'EXPENSE', 999, 'Leap expense', '2024-02-29T18:00:00.000Z', bIds.food);
  // Last day of a 31-day month at 18:00 UTC
  await txn(bt, bIds.accountId, 'EXPENSE', 3131, 'Big month end', `${YEAR}-07-31T18:00:00.000Z`, bIds.food);

  const yearTrend = await request('GET',
    `/api/analytics/income-expenses?period=custom&startDate=${YEAR - 1}-12-01&endDate=${YEAR}-01-31&granularity=month`,
    { token: bt });
  check('Year boundary splits into Dec and Jan buckets',
    yearTrend.data.buckets.length === 2 &&
    yearTrend.data.buckets[0].key === `${YEAR - 1}-12` &&
    yearTrend.data.buckets[1].key === `${YEAR}-01`,
    JSON.stringify(yearTrend.data.buckets.map((b) => b.key)));
  check('Year boundary keeps each month separate (4000 / 6000)',
    approx(yearTrend.data.buckets[0].income, 4000) && approx(yearTrend.data.buckets[1].income, 6000),
    JSON.stringify(yearTrend.data.buckets.map((b) => b.income)));

  const leapIn = await request('GET',
    '/api/analytics/income-expenses?period=custom&startDate=2024-02-01&endDate=2024-02-29', { token: bt });
  check('Leap-day income included when endDate = 2024-02-29',
    approx(leapIn.data.totals.income, 1000) && approx(leapIn.data.totals.expense, 999),
    JSON.stringify(leapIn.data.totals));

  const noLeap = await request('GET',
    '/api/analytics/income-expenses?period=custom&startDate=2024-02-01&endDate=2024-02-28', { token: bt });
  check('Leap-day transactions excluded when endDate = 2024-02-28',
    noLeap.data.totals.income === 0 && noLeap.data.totals.expense === 0,
    JSON.stringify(noLeap.data.totals));

  const afterLeap = await request('GET',
    '/api/analytics/income-expenses?period=custom&startDate=2024-03-01&endDate=2024-03-31', { token: bt });
  check('Leap-day transactions excluded from March',
    afterLeap.data.totals.income === 0 && afterLeap.data.totals.expense === 0,
    JSON.stringify(afterLeap.data.totals));

  const july = await request('GET',
    `/api/analytics/income-expenses?period=custom&startDate=${YEAR}-07-01&endDate=${YEAR}-07-31`,
    { token: bt });
  check('31st of a 31-day month included (18:00 UTC)',
    approx(july.data.totals.expense, 3131), JSON.stringify(july.data.totals));

  const lastDayBudget = await request('POST', '/api/budgets', {
    token: bt, body: { categoryId: bIds.food, amount: 5000, month: 7, year: YEAR }
  });
  check('Boundary-user budget created (201)', lastDayBudget.status === 201, JSON.stringify(lastDayBudget.data));
  const julyOverview = await request('GET', `/api/dashboard/budget-overview?month=7&year=${YEAR}`, { token: bt });
  check('Budget spent includes the 31st at 18:00 (leap/month-end fix)',
    approx(julyOverview.data.totals.totalSpent, 3131),
    JSON.stringify(julyOverview.data.totals));

  const febBudget = await request('POST', '/api/budgets', {
    token: bt, body: { categoryId: bIds.food, amount: 5000, month: 2, year: 2024 }
  });
  check('Leap-month budget created (201)', febBudget.status === 201, JSON.stringify(febBudget.data));
  const febOverview = await request('GET', '/api/dashboard/budget-overview?month=2&year=2024', { token: bt });
  check('Leap-day expense counted in the Feb 2024 budget',
    approx(febOverview.data.totals.totalSpent, 999), JSON.stringify(febOverview.data.totals));

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
