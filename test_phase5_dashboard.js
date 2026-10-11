/* Phase 5 — Dashboard summary test suite (run with server on :3001) */
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
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function register(email) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name: 'Dashboard Tester' }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

async function run() {
  console.log('=== PHASE 5 · DASHBOARD ===\n');
  const token = await register(`p5_dashboard_${Date.now()}@example.com`);

  console.log('Security');
  const noAuth = await request('GET', '/api/dashboard/summary');
  check('Unauthenticated summary rejected (401)', noAuth.status === 401, `got ${noAuth.status}`);

  const empty = await request('GET', '/api/dashboard/summary', { token });
  check('Empty-state summary (200)', empty.status === 200, `got ${empty.status}`);
  check('Zeroed totals for a new user',
    approx(empty.data.totalBalance, 0) && approx(empty.data.totalIncome, 0) &&
    approx(empty.data.totalExpenses, 0) && approx(empty.data.totalSavings, 0),
    JSON.stringify(empty.data));
  check('Savings block present with expected keys',
    empty.data.savings && 'activeCount' in empty.data.savings &&
    'totalSaved' in empty.data.savings && 'totalTargets' in empty.data.savings,
    JSON.stringify(empty.data.savings));
  check('Recurring block present with expected keys',
    empty.data.recurring && 'activeCount' in empty.data.recurring &&
    'monthlyCost' in empty.data.recurring && 'upcomingCount' in empty.data.recurring,
    JSON.stringify(empty.data.recurring));

  const noTxns = await request('GET', '/api/dashboard/recent-transactions', { token });
  check('Recent transactions (200)', noTxns.status === 200, `got ${noTxns.status}`);
  check('Empty list for new user', Array.isArray(noTxns.data.transactions) && noTxns.data.transactions.length === 0,
    JSON.stringify(noTxns.data));

  console.log('\nWith data');
  const account = await request('POST', '/api/accounts', {
    token, body: { name: 'Dash Bank', type: 'BANK', balance: 10000, currency: 'INR', color: '#22c55e' }
  });
  const accountId = account.data.account?.id;
  const cats = await request('GET', '/api/categories?type=EXPENSE', { token });
  const categoryId = cats.data.categories?.[0]?.id;

  const txn = await request('POST', '/api/transactions', {
    token,
    body: { type: 'EXPENSE', amount: 500, description: 'Groceries', date: new Date().toISOString(), accountId, categoryId }
  });
  check('Seed expense transaction (201)', txn.status === 201, `got ${txn.status} ${JSON.stringify(txn.data)}`);

  const goal = await request('POST', '/api/savings-goals', {
    token, body: { name: 'Emergency Fund', targetAmount: 100000, currentAmount: 45000, targetDate: iso(120) }
  });
  check('Seed savings goal (201)', goal.status === 201, `got ${goal.status}`);

  const recur = await request('POST', '/api/recurring-expenses', {
    token,
    body: { name: 'Netflix', amount: 649, frequency: 'MONTHLY', nextDueDate: iso(3), accountId, categoryId }
  });
  check('Seed recurring expense (201)', recur.status === 201, `got ${recur.status}`);

  const summary = await request('GET', '/api/dashboard/summary', { token });
  check('Summary (200)', summary.status === 200, `got ${summary.status}`);
  check('totalBalance includes account balance', approx(summary.data.totalBalance, 10000 - 500),
    summary.data.totalBalance);
  check('totalExpenses = 500', approx(summary.data.totalExpenses, 500), summary.data.totalExpenses);
  check('totalSavings = 45000', approx(summary.data.totalSavings, 45000), summary.data.totalSavings);
  check('savings.activeCount = 1', summary.data.savings.activeCount === 1, summary.data.savings.activeCount);
  check('savings.totalTargets = 100000', approx(summary.data.savings.totalTargets, 100000),
    summary.data.savings.totalTargets);
  check('recurring.activeCount = 1', summary.data.recurring.activeCount === 1, summary.data.recurring.activeCount);
  check('recurring.monthlyCost = 649', approx(summary.data.recurring.monthlyCost, 649),
    summary.data.recurring.monthlyCost);
  check('recurring.upcomingCount = 1', summary.data.recurring.upcomingCount === 1,
    summary.data.recurring.upcomingCount);

  const recent = await request('GET', '/api/dashboard/recent-transactions?limit=5', { token });
  check('Recent transactions returns seeded txn',
    recent.data.transactions?.length === 1 && recent.data.transactions[0].description === 'Groceries',
    JSON.stringify(recent.data));

  const badLimit = await request('GET', '/api/dashboard/recent-transactions?limit=999', { token });
  check('Invalid limit rejected (400)', badLimit.status === 400, `got ${badLimit.status}`);

  console.log('\nIsolation');
  const other = await register(`p5_dashboard_other_${Date.now()}@example.com`);
  const otherSummary = await request('GET', '/api/dashboard/summary', { token: other });
  check("Another user's summary is empty",
    approx(otherSummary.data.totalBalance, 0) && otherSummary.data.savings.activeCount === 0 &&
    otherSummary.data.recurring.activeCount === 0,
    JSON.stringify(otherSummary.data));

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
