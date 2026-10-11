/* Phase 5 — Recurring Expenses API test suite (run with server on :3001) */
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
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label} ${detail}`);
  }
}

const approx = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
const iso = (daysFromNow) =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function register(email) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name: 'Phase 5 Tester' }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

async function setupAccountAndCategories(token) {
  const account = await request('POST', '/api/accounts', {
    token,
    body: { name: 'Everyday Bank', type: 'BANK', balance: 50000, currency: 'INR', color: '#22c55e' }
  });
  const expenseCats = await request('GET', '/api/categories?type=EXPENSE', { token });
  const incomeCats = await request('GET', '/api/categories?type=INCOME', { token });
  return {
    accountId: account.data.account?.id,
    expenseCategoryId: expenseCats.data.categories?.[0]?.id,
    incomeCategoryId: incomeCats.data.categories?.[0]?.id
  };
}

async function run() {
  console.log('=== PHASE 5 · RECURRING EXPENSES ===\n');
  const stamp = Date.now();
  const tokenA = await register(`p5_recurring_a_${stamp}@example.com`);
  const tokenB = await register(`p5_recurring_b_${stamp}@example.com`);
  const tokenC = await register(`p5_recurring_c_${stamp}@example.com`);

  const a = await setupAccountAndCategories(tokenA);
  const b = await setupAccountAndCategories(tokenB);

  check('Setup: account + categories for user A', Boolean(a.accountId && a.expenseCategoryId),
    JSON.stringify(a));
  check('Setup: account + categories for user B', Boolean(b.accountId && b.expenseCategoryId));

  console.log('\nSecurity');
  const noAuth = await request('GET', '/api/recurring-expenses');
  check('Unauthenticated request rejected (401)', noAuth.status === 401, `got ${noAuth.status}`);

  console.log('\nCreate recurring expense');
  const netflix = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: {
      name: 'Netflix', amount: 649, frequency: 'MONTHLY', nextDueDate: iso(3),
      accountId: a.accountId, categoryId: a.expenseCategoryId, description: 'Netflix subscription'
    }
  });
  check('Create Netflix (201)', netflix.status === 201, `got ${netflix.status} ${JSON.stringify(netflix.data)}`);
  const netflixId = netflix.data.recurringExpense?.id;
  check('Defaults to active', netflix.data.recurringExpense?.isActive === true);
  check('Derived monthlyAmount = 649', approx(netflix.data.recurringExpense?.monthlyAmount, 649),
    netflix.data.recurringExpense?.monthlyAmount);
  check('Derived yearlyAmount = 7788', approx(netflix.data.recurringExpense?.yearlyAmount, 7788),
    netflix.data.recurringExpense?.yearlyAmount);
  check('frequencyLabel = month', netflix.data.recurringExpense?.frequencyLabel === 'month');

  console.log('\nCreate validation');
  const noName = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { amount: 100, frequency: 'MONTHLY', nextDueDate: iso(1), accountId: a.accountId, categoryId: a.expenseCategoryId }
  });
  check('Missing name rejected (400)', noName.status === 400, `got ${noName.status}`);

  const zeroAmount = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Bad', amount: 0, frequency: 'MONTHLY', nextDueDate: iso(1), accountId: a.accountId, categoryId: a.expenseCategoryId }
  });
  check('amount = 0 rejected (400)', zeroAmount.status === 400, `got ${zeroAmount.status}`);

  const badFrequency = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Bad', amount: 100, frequency: 'DAILY', nextDueDate: iso(1), accountId: a.accountId, categoryId: a.expenseCategoryId }
  });
  check('Invalid frequency rejected (400)', badFrequency.status === 400, `got ${badFrequency.status}`);

  const badDate = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Bad', amount: 100, frequency: 'MONTHLY', nextDueDate: 'nope', accountId: a.accountId, categoryId: a.expenseCategoryId }
  });
  check('Invalid date rejected (400)', badDate.status === 400, `got ${badDate.status}`);

  const badAccount = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Bad', amount: 100, frequency: 'MONTHLY', nextDueDate: iso(1), accountId: 'does-not-exist', categoryId: a.expenseCategoryId }
  });
  check('Invalid account rejected (400)', badAccount.status === 400, `got ${badAccount.status}`);

  const foreignAccount = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Bad', amount: 100, frequency: 'MONTHLY', nextDueDate: iso(1), accountId: b.accountId, categoryId: a.expenseCategoryId }
  });
  check("Another user's account rejected (400)", foreignAccount.status === 400, `got ${foreignAccount.status}`);

  const badCategory = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Bad', amount: 100, frequency: 'MONTHLY', nextDueDate: iso(1), accountId: a.accountId, categoryId: 'does-not-exist' }
  });
  check('Invalid category rejected (400)', badCategory.status === 400, `got ${badCategory.status}`);

  const incomeCategory = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Bad', amount: 100, frequency: 'MONTHLY', nextDueDate: iso(1), accountId: a.accountId, categoryId: a.incomeCategoryId }
  });
  check('Non-EXPENSE category rejected (400)', incomeCategory.status === 400, `got ${incomeCategory.status}`);

  console.log('\nList / get / update / delete');
  const spotify = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Spotify', amount: 119, frequency: 'MONTHLY', nextDueDate: iso(8), accountId: a.accountId, categoryId: a.expenseCategoryId }
  });
  const gym = await request('POST', '/api/recurring-expenses', {
    token: tokenA,
    body: { name: 'Gym', amount: 1500, frequency: 'MONTHLY', nextDueDate: iso(5), accountId: a.accountId, categoryId: a.expenseCategoryId }
  });
  check('Seed Spotify + Gym', spotify.status === 201 && gym.status === 201,
    `${spotify.status} ${gym.status}`);

  const list = await request('GET', '/api/recurring-expenses', { token: tokenA });
  check('List (200)', list.status === 200, `got ${list.status}`);
  check('Returns 3 active items', list.data.recurringExpenses?.length === 3, list.data.recurringExpenses?.length);

  const single = await request('GET', `/api/recurring-expenses/${netflixId}`, { token: tokenA });
  check('Get single (200)', single.status === 200, `got ${single.status}`);
  check('Single includes account + category',
    Boolean(single.data.recurringExpense?.account?.id && single.data.recurringExpense?.category?.id));

  const updated = await request('PUT', `/api/recurring-expenses/${netflixId}`, {
    token: tokenA, body: { amount: 699, description: 'Updated plan' }
  });
  check('Update amount (200)', updated.status === 200 && approx(updated.data.recurringExpense?.amount, 699),
    JSON.stringify(updated.data));
  check('Update recalculates yearlyAmount', approx(updated.data.recurringExpense?.yearlyAmount, 8388),
    updated.data.recurringExpense?.yearlyAmount);

  console.log('\nSummary & upcoming');
  const summary = await request('GET', '/api/recurring-expenses/summary?days=30', { token: tokenA });
  check('Summary (200)', summary.status === 200, `got ${summary.status}`);
  check('activeCount = 3', summary.data.activeCount === 3, summary.data.activeCount);
  check('monthlyCost = 699 + 119 + 1500 = 2318', approx(summary.data.monthlyCost, 2318), summary.data.monthlyCost);
  check('yearlyCost = 27816', approx(summary.data.yearlyCost, 27816), summary.data.yearlyCost);
  check('upcomingCount >= 3', summary.data.upcomingCount >= 3, summary.data.upcomingCount);
  check('nextPayment present', Boolean(summary.data.nextPayment?.name), JSON.stringify(summary.data.nextPayment));

  const upcoming = await request('GET', '/api/recurring-expenses/upcoming?days=30&limit=10', { token: tokenA });
  check('Upcoming (200)', upcoming.status === 200, `got ${upcoming.status}`);
  const dates = upcoming.data.upcoming.map((i) => i.nextDueDate);
  const sorted = dates.every((d, idx) => idx === 0 || dates[idx - 1] <= d);
  check('Sorted by nextDueDate ASC', sorted, JSON.stringify(dates));
  check('Only active items returned', upcoming.data.upcoming.every((i) => i.isActive));
  check('First item is Netflix (earliest due)', upcoming.data.upcoming[0]?.name === 'Netflix',
    upcoming.data.upcoming[0]?.name);

  console.log('\nPause / resume');
  const paused = await request('PUT', `/api/recurring-expenses/${netflixId}`, {
    token: tokenA, body: { isActive: false }
  });
  check('Pause (isActive=false)', paused.status === 200 && paused.data.recurringExpense.isActive === false,
    JSON.stringify(paused.data));

  const activeAfterPause = await request('GET', '/api/recurring-expenses?status=active', { token: tokenA });
  check('Paused item excluded from active list',
    activeAfterPause.data.recurringExpenses?.length === 2 &&
    !activeAfterPause.data.recurringExpenses.some((i) => i.id === netflixId),
    activeAfterPause.data.recurringExpenses?.length);

  const pausedList = await request('GET', '/api/recurring-expenses?status=inactive', { token: tokenA });
  check('Paused item appears in inactive list',
    pausedList.data.recurringExpenses?.length === 1 &&
    pausedList.data.recurringExpenses.some((i) => i.id === netflixId));

  const summaryAfterPause = await request('GET', '/api/recurring-expenses/summary?days=30', { token: tokenA });
  check('Paused item excluded from monthly cost', approx(summaryAfterPause.data.monthlyCost, 1619),
    summaryAfterPause.data.monthlyCost);
  check('activeCount = 2 after pause', summaryAfterPause.data.activeCount === 2, summaryAfterPause.data.activeCount);
  check('pausedCount = 1', summaryAfterPause.data.pausedCount === 1, summaryAfterPause.data.pausedCount);

  const upcomingAfterPause = await request('GET', '/api/recurring-expenses/upcoming?days=30', { token: tokenA });
  check('Paused item excluded from upcoming',
    !upcomingAfterPause.data.upcoming.some((i) => i.id === netflixId));

  const stillExists = await request('GET', `/api/recurring-expenses/${netflixId}`, { token: tokenA });
  check('Paused row still in database', stillExists.status === 200, `got ${stillExists.status}`);

  const resumed = await request('PUT', `/api/recurring-expenses/${netflixId}`, {
    token: tokenA, body: { isActive: true }
  });
  check('Resume (isActive=true)', resumed.status === 200 && resumed.data.recurringExpense.isActive === true);

  console.log('\nFrequency calculations (isolated user)');
  const c = await setupAccountAndCategories(tokenC);
  const freqs = [
    { frequency: 'WEEKLY', expectedYearly: 1200 * 52, expectedMonthly: (1200 * 52) / 12 },
    { frequency: 'MONTHLY', expectedYearly: 1200 * 12, expectedMonthly: 1200 },
    { frequency: 'QUARTERLY', expectedYearly: 1200 * 4, expectedMonthly: (1200 * 4) / 12 },
    { frequency: 'YEARLY', expectedYearly: 1200, expectedMonthly: 1200 / 12 }
  ];
  for (const f of freqs) {
    const res = await request('POST', '/api/recurring-expenses', {
      token: tokenC,
      body: { name: `${f.frequency} item`, amount: 1200, frequency: f.frequency, nextDueDate: iso(2), accountId: c.accountId, categoryId: c.expenseCategoryId }
    });
    check(`Create ${f.frequency} item (201)`, res.status === 201, `got ${res.status}`);
    check(`${f.frequency} yearly = ${f.expectedYearly}`, approx(res.data.recurringExpense?.yearlyAmount, f.expectedYearly),
      res.data.recurringExpense?.yearlyAmount);
    check(`${f.frequency} monthly = ${Math.round(f.expectedMonthly)}`,
      approx(res.data.recurringExpense?.monthlyAmount, Math.round(f.expectedMonthly * 100) / 100),
      res.data.recurringExpense?.monthlyAmount);
  }

  const cSummary = await request('GET', '/api/recurring-expenses/summary?days=30', { token: tokenC });
  const expectedYearlyTotal = 1200 * 52 + 1200 * 12 + 1200 * 4 + 1200;
  const expectedMonthlyTotal = expectedYearlyTotal / 12;
  check('Combined yearly cost correct', approx(cSummary.data.yearlyCost, expectedYearlyTotal),
    `${cSummary.data.yearlyCost} vs ${expectedYearlyTotal}`);
  check('Combined monthly cost correct', approx(cSummary.data.monthlyCost, Math.round(expectedMonthlyTotal * 100) / 100),
    `${cSummary.data.monthlyCost} vs ${expectedMonthlyTotal}`);
  check('All 4 frequencies active', cSummary.data.activeCount === 4, cSummary.data.activeCount);

  console.log('\nCross-user access');
  const bReads = await request('GET', `/api/recurring-expenses/${netflixId}`, { token: tokenB });
  check("User B cannot read user A's item (404)", bReads.status === 404, `got ${bReads.status}`);

  const bUpdates = await request('PUT', `/api/recurring-expenses/${netflixId}`, {
    token: tokenB, body: { amount: 1 }
  });
  check("User B cannot update user's item (404)", bUpdates.status === 404, `got ${bUpdates.status}`);

  const bDeletes = await request('DELETE', `/api/recurring-expenses/${netflixId}`, { token: tokenB });
  check("User B cannot delete user's item (404)", bDeletes.status === 404, `got ${bDeletes.status}`);

  const bList = await request('GET', '/api/recurring-expenses?status=all', { token: tokenB });
  check("User B's list excludes A's items",
    bList.status === 200 && !bList.data.recurringExpenses.some((i) => i.id === netflixId));

  // Give B an item of their own so isolation is proven by a positive count.
  const bOwn = await request('POST', '/api/recurring-expenses', {
    token: tokenB,
    body: { name: 'B Netflix', amount: 100, frequency: 'MONTHLY', nextDueDate: iso(4), accountId: b.accountId, categoryId: b.expenseCategoryId }
  });
  check("User B can create their own item", bOwn.status === 201, `got ${bOwn.status}`);

  const bSummary = await request('GET', '/api/recurring-expenses/summary', { token: tokenB });
  check("User B's summary only counts B's own items", bSummary.data.activeCount === 1, bSummary.data.activeCount);
  check("User B's monthly cost unaffected by A's items", approx(bSummary.data.monthlyCost, 100),
    bSummary.data.monthlyCost);

  console.log('\nNo transactions are ever created');
  const txns = await request('GET', '/api/transactions?limit=100', { token: tokenA });
  const txnTotal = txns.data.pagination?.total ?? -1;
  check('No transactions exist for user A after all recurring operations', txnTotal === 0, txnTotal);

  console.log('\nDelete');
  const deleted = await request('DELETE', `/api/recurring-expenses/${gym.data.recurringExpense.id}`, { token: tokenA });
  check('Delete (200)', deleted.status === 200, `got ${deleted.status}`);
  const afterDelete = await request('GET', '/api/recurring-expenses?status=all', { token: tokenA });
  check('Item removed from list', afterDelete.data.recurringExpenses?.length === 2, afterDelete.data.recurringExpenses?.length);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
