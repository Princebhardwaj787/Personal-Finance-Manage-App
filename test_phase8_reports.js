/* Phase 8 — Reports: correctness, filters, date edges, ownership.
   Run with the API server on :3001 ->  node test_phase8_reports.js */
const http = require('http');

let passed = 0, failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail}`); }
}

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
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const approx = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
const q = (params) => Object.entries(params)
  .filter(([, v]) => v !== '' && v !== undefined && v !== null)
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join('&');

async function register(email, name) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

async function setupUser(token, { withBudget = false } = {}) {
  const bank = await request('POST', '/api/accounts', {
    token, body: { name: 'HDFC Bank', type: 'BANK', balance: 100000, currency: 'INR' }
  });
  const accountId = bank.data.account.id;

  const food = await request('POST', '/api/categories', {
    token, body: { name: 'TestFood', type: 'EXPENSE', icon: 'utensils', color: '#ff0000' }
  });
  const bills = await request('POST', '/api/categories', {
    token, body: { name: 'TestBills', type: 'EXPENSE', icon: 'receipt', color: '#00ff00' }
  });
  const salary = await request('POST', '/api/categories', {
    token, body: { name: 'TestSalary', type: 'INCOME', icon: 'briefcase', color: '#0000ff' }
  });
  const foodId = food.data.category.id;
  const billsId = bills.data.category.id;
  const salaryId = salary.data.category.id;

  // September 2026 transactions
  await request('POST', '/api/transactions', {
    token, body: { type: 'INCOME', amount: 50000, description: 'Salary', accountId, categoryId: salaryId, date: '2026-09-01' }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 7500, description: 'Groceries', accountId, categoryId: foodId, date: '2026-09-10' }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 6000, description: 'Electricity', accountId, categoryId: billsId, date: '2026-09-15' }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 5000, description: 'More food', accountId, categoryId: foodId, date: '2026-09-20' }
  });

  if (withBudget) {
    await request('POST', '/api/budgets', {
      token, body: { name: 'Food budget', amount: 8000, month: 9, year: 2026, categoryId: foodId }
    });
  }

  return { accountId, foodId, billsId, salaryId };
}

async function main() {
  const email = `phase8_${Date.now()}@test.com`;
  const token = await register(email, 'Phase8');
  const { accountId, foodId, billsId, salaryId } = await setupUser(token, { withBudget: true });

  console.log('\n--- Monthly report (September 2026) ---');
  const monthly = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', monthly.status === 200);
  check('income = 50000', approx(monthly.data.summary.totalIncome, 50000), JSON.stringify(monthly.data.summary));
  check('expenses = 18500', approx(monthly.data.summary.totalExpenses, 18500), JSON.stringify(monthly.data.summary));
  check('net savings = 31500', approx(monthly.data.summary.netSavings, 31500));
  check('savings rate = 63', approx(monthly.data.summary.savingsRate, 63));
  check('hasData true', monthly.data.hasData === true);
  check('period label', monthly.data.period.label === 'September 2026', monthly.data.period.label);
  check('top categories present', monthly.data.topCategories.length >= 2);
  check('top category is TestFood (12500)', monthly.data.topCategories[0]?.name === 'TestFood' && approx(monthly.data.topCategories[0]?.amount, 12500));
  check('largest transaction = 50000', approx(monthly.data.largestTransactions[0]?.amount, 50000));
  check('budget present', monthly.data.budget?.budgetCount === 1);
  check('budget total = 8000', approx(monthly.data.budget?.totalBudget, 8000));
  check('budget spent = 12500', approx(monthly.data.budget?.totalSpent, 12500));
  check('budget status EXCEEDED', monthly.data.budget?.status === 'EXCEEDED');

  console.log('\n--- Yearly report (2026) ---');
  const yearly = await request('GET', `/api/reports/yearly?${q({ startDate: '2026-01-01', endDate: '2026-12-31' })}`, { token });
  check('status 200', yearly.status === 200);
  check('total income = 50000', approx(yearly.data.summary.totalIncome, 50000));
  check('total expenses = 18500', approx(yearly.data.summary.totalExpenses, 18500));
  check('total savings = 31500', approx(yearly.data.summary.totalSavings, 31500));
  check('avg monthly income = 4166.67', approx(yearly.data.summary.averageMonthlyIncome, 4166.67));
  check('avg monthly expenses = 1541.67', approx(yearly.data.summary.averageMonthlyExpenses, 1541.67));
  check('12 months present', yearly.data.months.length === 12);
  check('September has data', approx(yearly.data.months[8].income, 50000) && approx(yearly.data.months[8].expenses, 18500));
  check('January is zero', approx(yearly.data.months[0].income, 0) && approx(yearly.data.months[0].expenses, 0));
  check('savings rate = 63', approx(yearly.data.summary.savingsRate, 63));

  console.log('\n--- Transactions report ---');
  const txns = await request('GET', `/api/reports/transactions?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', txns.status === 200);
  check('total = 4', txns.data.total === 4);
  check('columns correct', txns.data.columns.length === 7 && txns.data.columns[0] === 'Date');
  check('items present', txns.data.items.length === 4);
  check('item has notes field', txns.data.items[0].hasOwnProperty('notes'));

  console.log('\n--- Categories report ---');
  const cats = await request('GET', `/api/reports/categories?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', cats.status === 200);
  check('hasData true', cats.data.hasData === true);
  check('sorted by amount desc', cats.data.categories[0].amount >= cats.data.categories[1].amount);
  check('TestFood amount = 12500', approx(cats.data.categories.find(c => c.name === 'TestFood')?.amount, 12500));
  check('share percent sums to 100', approx(cats.data.categories.reduce((s, c) => s + c.sharePercent, 0), 100));
  check('count present', cats.data.categories[0].count > 0);

  console.log('\n--- Budgets report ---');
  const budgets = await request('GET', `/api/reports/budgets?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', budgets.status === 200);
  check('hasData true', budgets.data.hasData === true);
  check('budget count = 1', budgets.data.budgets.length === 1);
  check('budget status EXCEEDED', budgets.data.budgets[0].status === 'EXCEEDED');
  check('budget usage > 100', budgets.data.budgets[0].percentageUsed > 100);

  console.log('\n--- Accounts report ---');
  const accounts = await request('GET', `/api/reports/accounts?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token });
  check('status 200', accounts.status === 200);
  check('hasData true', accounts.data.hasData === true);
  const acc = accounts.data.accounts.find(a => a.name === 'HDFC Bank');
  check('income = 50000', approx(acc?.income, 50000));
  check('expenses = 18500', approx(acc?.expenses, 18500));
  check('transaction count = 4', acc?.transactionCount === 4);
  check('transfers in = 0', approx(acc?.transfersIn, 0));
  check('transfers out = 0', approx(acc?.transfersOut, 0));

  console.log('\n--- Filter consistency ---');
  const foodOnly = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-30', categoryId: foodId })}`, { token });
  check('food-only expenses = 12500', approx(foodOnly.data.summary.totalExpenses, 12500));
  check('food-only income = 0', approx(foodOnly.data.summary.totalIncome, 0));

  const incomeOnly = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-30', type: 'INCOME' })}`, { token });
  check('income-only total = 50000', approx(incomeOnly.data.summary.totalIncome, 50000));
  check('income-only expenses = 0', approx(incomeOnly.data.summary.totalExpenses, 0));

  console.log('\n--- Date edges ---');
  const firstDay = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-01' })}`, { token });
  check('first day of month: income = 50000', approx(firstDay.data.summary.totalIncome, 50000));

  const lastDay = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-30', endDate: '2026-09-30' })}`, { token });
  check('last day of month: budget still present', lastDay.data.hasData === true && lastDay.data.budget?.budgetCount === 1);

  const yearBoundary = await request('GET', `/api/reports/yearly?${q({ startDate: '2025-12-01', endDate: '2026-01-31' })}`, { token });
  check('year boundary: 2 months', yearBoundary.data.months.length === 2);
  check('year boundary: no data in range', approx(yearBoundary.data.months[0].income, 0) && approx(yearBoundary.data.months[1].income, 0));

  const leapYear = await request('GET', `/api/reports/monthly?${q({ startDate: '2024-02-01', endDate: '2024-02-29' })}`, { token });
  check('leap year Feb: no data', leapYear.data.hasData === false);
  check('leap year Feb: message', leapYear.data.message === 'No financial data is available for the selected period.');

  console.log('\n--- Security ---');
  const noauth = await request('GET', '/api/reports/monthly?period=this_month');
  check('401 unauthenticated', noauth.status === 401);

  const noauthCsv = await request('GET', '/api/reports/transactions/export?format=csv&period=this_month');
  check('401 CSV unauthenticated', noauthCsv.status === 401);

  const noauthPdf = await request('GET', '/api/reports/monthly/export?format=pdf&period=this_month');
  check('401 PDF unauthenticated', noauthPdf.status === 401);

  const noauthHistory = await request('GET', '/api/reports/history');
  check('401 history unauthenticated', noauthHistory.status === 401);

  // User B cannot see User A's data
  const emailB = `phase8_b_${Date.now()}@test.com`;
  const tokenB = await register(emailB, 'Phase8B');
  const bankB = await request('POST', '/api/accounts', {
    token: tokenB, body: { name: 'SBI', type: 'BANK', balance: 5000, currency: 'INR' }
  });
  const accountBId = bankB.data.account.id;

  const bReport = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token: tokenB });
  check('User B: no data', bReport.data.hasData === false);

  // User B filtering by User A's accountId gets empty results
  const bFilterA = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-30', accountId })}`, { token: tokenB });
  check('User B filter by A account: no data', bFilterA.data.hasData === false);

  // User B filtering by User A's categoryId gets empty results
  const bFilterCat = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-30', categoryId: foodId })}`, { token: tokenB });
  check('User B filter by A category: no data', bFilterCat.data.hasData === false);

  // User B's own data is visible
  await request('POST', '/api/transactions', {
    token: tokenB, body: { type: 'INCOME', amount: 10000, description: 'B salary', accountId: accountBId, date: '2026-09-05' }
  });
  const bOwn = await request('GET', `/api/reports/monthly?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token: tokenB });
  check('User B own data visible', approx(bOwn.data.summary.totalIncome, 10000));

  // History is scoped per user — both users generated reports, so both
  // have entries, but each entry must belong to the requesting user.
  const histA = await request('GET', '/api/reports/history', { token });
  const histB = await request('GET', '/api/reports/history', { token: tokenB });
  check('User A history not empty', histA.data.history.length > 0);
  check('User B history not empty', histB.data.history.length > 0);
  const aUserIds = new Set(histA.data.history.map((h) => h.userId));
  const bUserIds = new Set(histB.data.history.map((h) => h.userId));
  check('User A history single owner', aUserIds.size === 1);
  check('User B history single owner', bUserIds.size === 1);
  check('History owners differ', ![...aUserIds].some((id) => bUserIds.has(id)));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
