/* Phase 5 — Savings Goals API test suite (run with server on :3001) */
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

async function register(email) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name: 'Phase 5 Tester' }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

async function run() {
  console.log('=== PHASE 5 · SAVINGS GOALS ===\n');
  const stamp = Date.now();
  const tokenA = await register(`p5_savings_a_${stamp}@example.com`);
  const tokenB = await register(`p5_savings_b_${stamp}@example.com`);

  console.log('Security');
  const noAuth = await request('GET', '/api/savings-goals');
  check('Unauthenticated request rejected (401)', noAuth.status === 401, `got ${noAuth.status}`);

  console.log('\nCreate goal');
  const created = await request('POST', '/api/savings-goals', {
    token: tokenA,
    body: {
      name: 'New Laptop',
      description: 'Savings for a new laptop',
      targetAmount: 80000,
      currentAmount: 15000,
      targetDate: '2027-03-01'
    }
  });
  check('Create goal (201)', created.status === 201, `got ${created.status} ${JSON.stringify(created.data)}`);
  const goal = created.data.goal;
  check('Initial status ACTIVE', goal?.status === 'ACTIVE', goal?.status);
  check('remainingAmount = 65000', goal?.remainingAmount === 65000, goal?.remainingAmount);
  check('percentageComplete = 18.75', goal?.percentageComplete === 18.75, goal?.percentageComplete);
  check('description stored', goal?.description === 'Savings for a new laptop');
  check('contributionsCount = 0', goal?.contributionsCount === 0, goal?.contributionsCount);

  const goalId = goal?.id;

  console.log('\nCreate validation');
  const noName = await request('POST', '/api/savings-goals', {
    token: tokenA, body: { targetAmount: 100, targetDate: '2027-01-01' }
  });
  check('Missing name rejected (400)', noName.status === 400, `got ${noName.status}`);

  const zeroTarget = await request('POST', '/api/savings-goals', {
    token: tokenA, body: { name: 'Bad', targetAmount: 0, targetDate: '2027-01-01' }
  });
  check('targetAmount = 0 rejected (400)', zeroTarget.status === 400, `got ${zeroTarget.status}`);

  const negativeCurrent = await request('POST', '/api/savings-goals', {
    token: tokenA, body: { name: 'Bad', targetAmount: 100, currentAmount: -5, targetDate: '2027-01-01' }
  });
  check('Negative currentAmount rejected (400)', negativeCurrent.status === 400, `got ${negativeCurrent.status}`);

  const overTarget = await request('POST', '/api/savings-goals', {
    token: tokenA, body: { name: 'Bad', targetAmount: 100, currentAmount: 500, targetDate: '2027-01-01' }
  });
  check('currentAmount > targetAmount rejected (400)', overTarget.status === 400, `got ${overTarget.status}`);

  const badDate = await request('POST', '/api/savings-goals', {
    token: tokenA, body: { name: 'Bad', targetAmount: 100, targetDate: 'not-a-date' }
  });
  check('Invalid targetDate rejected (400)', badDate.status === 400, `got ${badDate.status}`);

  console.log('\nList & get');
  const list = await request('GET', '/api/savings-goals', { token: tokenA });
  check('List goals (200)', list.status === 200, `got ${list.status}`);
  check('Only own goals returned', Array.isArray(list.data.goals) && list.data.goals.every((g) => g.id !== undefined));
  check('List contains created goal', list.data.goals.some((g) => g.id === goalId));

  const single = await request('GET', `/api/savings-goals/${goalId}`, { token: tokenA });
  check('Get single goal (200)', single.status === 200, `got ${single.status}`);
  check('Single goal has derived fields',
    typeof single.data.goal?.remainingAmount === 'number' &&
    typeof single.data.goal?.percentageComplete === 'number');

  const summary = await request('GET', '/api/savings-goals/summary', { token: tokenA });
  check('Summary endpoint (200)', summary.status === 200, `got ${summary.status}`);
  check('Summary has activeCount/totalSaved/totalTargets',
    typeof summary.data?.activeCount === 'number' &&
    typeof summary.data?.totalSaved === 'number' &&
    typeof summary.data?.totalTargets === 'number');

  console.log('\nUpdate goal');
  const renamed = await request('PUT', `/api/savings-goals/${goalId}`, {
    token: tokenA, body: { name: 'New Laptop Fund' }
  });
  check('Rename goal (200)', renamed.status === 200 && renamed.data.goal.name === 'New Laptop Fund',
    JSON.stringify(renamed.data));

  const shrinkTarget = await request('PUT', `/api/savings-goals/${goalId}`, {
    token: tokenA, body: { targetAmount: 10000 }
  });
  check('Target below saved amount rejected (400)', shrinkTarget.status === 400, `got ${shrinkTarget.status}`);

  const badStatus = await request('PUT', `/api/savings-goals/${goalId}`, {
    token: tokenA, body: { status: 'BOGUS' }
  });
  check('Invalid status rejected (400)', badStatus.status === 400, `got ${badStatus.status}`);

  console.log('\nContributions');
  const zeroContribution = await request('POST', `/api/savings-goals/${goalId}/contributions`, {
    token: tokenA, body: { amount: 0 }
  });
  check('Contribution of 0 rejected (400)', zeroContribution.status === 400, `got ${zeroContribution.status}`);

  const negativeContribution = await request('POST', `/api/savings-goals/${goalId}/contributions`, {
    token: tokenA, body: { amount: -100 }
  });
  check('Negative contribution rejected (400)', negativeContribution.status === 400, `got ${negativeContribution.status}`);

  const tooBig = await request('POST', `/api/savings-goals/${goalId}/contributions`, {
    token: tokenA, body: { amount: 70000 }
  });
  check('Overfunding rejected (400)', tooBig.status === 400, `got ${tooBig.status}`);
  const afterRejected = await request('GET', `/api/savings-goals/${goalId}`, { token: tokenA });
  check('Rejected contribution left goal unchanged', afterRejected.data.goal.currentAmount === 15000,
    afterRejected.data.goal.currentAmount);

  const contribution = await request('POST', `/api/savings-goals/${goalId}/contributions`, {
    token: tokenA, body: { amount: 5000, note: 'Savings from September salary' }
  });
  check('Valid contribution (201)', contribution.status === 201, `got ${contribution.status} ${JSON.stringify(contribution.data)}`);
  const afterContribution = contribution.data.goal;
  check('currentAmount = 20000', afterContribution?.currentAmount === 20000, afterContribution?.currentAmount);
  check('remainingAmount = 60000', afterContribution?.remainingAmount === 60000, afterContribution?.remainingAmount);
  check('percentageComplete = 25', afterContribution?.percentageComplete === 25, afterContribution?.percentageComplete);
  check('contributionsCount = 1', afterContribution?.contributionsCount === 1, afterContribution?.contributionsCount);
  check('Still ACTIVE', afterContribution?.status === 'ACTIVE', afterContribution?.status);

  const history = await request('GET', `/api/savings-goals/${goalId}/contributions?limit=10`, { token: tokenA });
  check('Contribution history (200)', history.status === 200, `got ${history.status}`);
  check('History has 1 entry', history.data.contributions?.length === 1, history.data.contributions?.length);
  check('History preserves note', history.data.contributions?.[0]?.note === 'Savings from September salary');
  check('History paginated', history.data.pagination?.total === 1 && history.data.pagination?.page === 1);

  console.log('\nCompletion');
  const finishing = await request('POST', `/api/savings-goals/${goalId}/contributions`, {
    token: tokenA, body: { amount: 60000, note: 'Final top-up' }
  });
  check('Final contribution (201)', finishing.status === 201, `got ${finishing.status}`);
  const completed = finishing.data.goal;
  check('Auto-marked COMPLETED', completed?.status === 'COMPLETED', completed?.status);
  check('percentageComplete = 100', completed?.percentageComplete === 100, completed?.percentageComplete);
  check('remainingAmount = 0', completed?.remainingAmount === 0, completed?.remainingAmount);
  check('Archived contributions preserved', completed?.contributionsCount === 2, completed?.contributionsCount);

  const archive = await request('PUT', `/api/savings-goals/${goalId}`, {
    token: tokenA, body: { status: 'ARCHIVED' }
  });
  check('Manual archive works', archive.status === 200 && archive.data.goal.status === 'ARCHIVED',
    JSON.stringify(archive.data));

  const reopen = await request('PUT', `/api/savings-goals/${goalId}`, {
    token: tokenA, body: { status: 'ACTIVE' }
  });
  check('Manual reopen works', reopen.status === 200 && reopen.data.goal.status === 'ACTIVE',
    JSON.stringify(reopen.data));

  console.log('\nCross-user access');
  const bReadsGoal = await request('GET', `/api/savings-goals/${goalId}`, { token: tokenB });
  check("User B cannot read user A's goal (404)", bReadsGoal.status === 404, `got ${bReadsGoal.status}`);

  const bUpdatesGoal = await request('PUT', `/api/savings-goals/${goalId}`, {
    token: tokenB, body: { name: 'Hacked' }
  });
  check("User B cannot update user's goal (404)", bUpdatesGoal.status === 404, `got ${bUpdatesGoal.status}`);

  const bContributes = await request('POST', `/api/savings-goals/${goalId}/contributions`, {
    token: tokenB, body: { amount: 100 }
  });
  check("User B cannot contribute to user's goal (404)", bContributes.status === 404, `got ${bContributes.status}`);

  const bDeletesGoal = await request('DELETE', `/api/savings-goals/${goalId}`, { token: tokenB });
  check("User B cannot delete user's goal (404)", bDeletesGoal.status === 404, `got ${bDeletesGoal.status}`);

  const bList = await request('GET', '/api/savings-goals', { token: tokenB });
  check("User B's list does not include A's goal",
    bList.status === 200 && !bList.data.goals.some((g) => g.id === goalId));

  console.log('\nDelete goal leaves transactions intact');
  let accounts = await request('GET', '/api/accounts', { token: tokenA });
  if (!accounts.data.accounts?.length) {
    accounts = await request('POST', '/api/accounts', {
      token: tokenA,
      body: { name: 'Test Wallet', type: 'CASH', balance: 1000, currency: 'INR', color: '#22c55e' }
    });
    // Re-read as a list so the shape below stays consistent.
    accounts = await request('GET', '/api/accounts', { token: tokenA });
  }
  const accountId = accounts.data.accounts?.[0]?.id;
  const categories = await request('GET', '/api/categories?type=EXPENSE', { token: tokenA });
  const categoryId = categories.data.categories?.[0]?.id;

  let txnCountBefore = null;
  let txnCountAfter = null;
  if (accountId && categoryId) {
    const createdTxn = await request('POST', '/api/transactions', {
      token: tokenA,
      body: {
        type: 'EXPENSE', amount: 250, description: 'Should survive goal deletion',
        date: new Date().toISOString(), accountId, categoryId
      }
    });
    check('Seed transaction created', createdTxn.status === 201, `got ${createdTxn.status} ${JSON.stringify(createdTxn.data)}`);

    const before = await request('GET', '/api/transactions?limit=100', { token: tokenA });
    txnCountBefore = before.data.pagination?.total;

    const deleted = await request('DELETE', `/api/savings-goals/${goalId}`, { token: tokenA });
    check('Delete goal (200)', deleted.status === 200, `got ${deleted.status}`);

    const after = await request('GET', '/api/transactions?limit=100', { token: tokenA });
    txnCountAfter = after.data.pagination?.total;
    check('Transactions unchanged after goal delete',
      txnCountBefore === txnCountAfter, `${txnCountBefore} -> ${txnCountAfter}`);

    const gone = await request('GET', `/api/savings-goals/${goalId}`, { token: tokenA });
    check('Goal no longer exists (404)', gone.status === 404, `got ${gone.status}`);

    const historyGone = await request('GET', `/api/savings-goals/${goalId}/contributions`, { token: tokenA });
    check('Contribution history cascade-deleted (404)', historyGone.status === 404, `got ${historyGone.status}`);
  } else {
    check('Seed account/category available for delete test', false, 'missing account or category');
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
