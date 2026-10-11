/* Phase 7 — Advanced transactions: search, filters, sorting, detail,
   duplicate, bulk delete, ownership.
   Run with the API server on :3001 ->  node test_phase7_transactions.js */
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
const ids = (res) => (res.data.transactions || []).map((t) => t.id);
const has = (res, id) => ids(res).includes(id);
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

async function setup(token) {
  const bank = await request('POST', '/api/accounts', {
    token,
    body: { name: 'HDFC Bank', type: 'BANK', balance: 100000, currency: 'INR' }
  });
  const wallet = await request('POST', '/api/accounts', {
    token,
    body: { name: 'UPI Wallet', type: 'UPI_WALLET', balance: 5000, currency: 'INR' }
  });
  const groceries = await request('POST', '/api/categories', {
    token,
    body: { name: `Groceries ${Date.now()}`, type: 'EXPENSE', icon: '🛒', color: '#ef4444' }
  });
  const utilities = await request('POST', '/api/categories', {
    token,
    body: { name: `Utilities ${Date.now()}`, type: 'EXPENSE', icon: '💡', color: '#f59e0b' }
  });
  const salary = await request('POST', '/api/categories', {
    token,
    body: { name: `Salary ${Date.now()}`, type: 'INCOME', icon: '💼', color: '#22c55e' }
  });
  return {
    bankId: bank.data.account?.id,
    walletId: wallet.data.account?.id,
    groceriesId: groceries.data.category?.id,
    groceriesName: groceries.data.category?.name,
    utilitiesId: utilities.data.category?.id,
    salaryId: salary.data.category?.id
  };
}

const balanceOf = async (token, accountId) => {
  const res = await request('GET', '/api/accounts', { token });
  const account = (res.data.accounts || []).find((a) => a.id === accountId);
  return account ? account.balance : null;
};

async function run() {
  console.log('=== PHASE 7 · TRANSACTIONS ===\n');
  const stamp = Date.now();
  const tokenA = await register(`p7_txn_a_${stamp}@example.com`, 'Phase 7 A');
  const tokenB = await register(`p7_txn_b_${stamp}@example.com`, 'Phase 7 B');

  const a = await setup(tokenA);
  const b = await setup(tokenB);
  check('Setup: accounts + categories for A', Boolean(a.bankId && a.groceriesId), JSON.stringify(a));
  check('Setup: accounts + categories for B', Boolean(b.bankId && b.groceriesId));

  console.log('\nSecurity');
  const noAuth = await request('GET', '/api/transactions');
  check('Unauthenticated list rejected (401)', noAuth.status === 401, `got ${noAuth.status}`);

  console.log('\nCreate with notes + reference');
  const t1 = (await request('POST', '/api/transactions', {
    token: tokenA,
    body: {
      type: 'EXPENSE', amount: 450, description: 'Dinner with friends',
      notes: 'Split bill with Rahul', reference: 'UPI-9981',
      accountId: a.bankId, categoryId: a.groceriesId, date: '2026-09-27'
    }
  })).data.transaction;

  const t2 = (await request('POST', '/api/transactions', {
    token: tokenA,
    body: {
      type: 'EXPENSE', amount: 1200, description: 'Electricity bill',
      notes: 'September bill', reference: 'EB-778',
      accountId: a.bankId, categoryId: a.utilitiesId, date: '2026-09-20'
    }
  })).data.transaction;

  const t3 = (await request('POST', '/api/transactions', {
    token: tokenA,
    body: {
      type: 'INCOME', amount: 50000, description: 'Monthly salary',
      notes: 'September salary', reference: 'SAL-09',
      accountId: a.bankId, categoryId: a.salaryId, date: '2026-09-01'
    }
  })).data.transaction;

  const t4 = (await request('POST', '/api/transactions', {
    token: tokenA,
    body: {
      type: 'EXPENSE', amount: 300, description: 'Coffee',
      accountId: a.walletId, categoryId: a.groceriesId, date: '2026-09-28'
    }
  })).data.transaction;

  check('Created transaction with notes + reference',
    Boolean(t1 && t1.notes === 'Split bill with Rahul' && t1.reference === 'UPI-9981'),
    JSON.stringify(t1?.notes));
  check('Missing notes/reference serialize as null',
    t4?.notes === null && t4?.reference === null);

  const bTxn = (await request('POST', '/api/transactions', {
    token: tokenB,
    body: {
      type: 'EXPENSE', amount: 999, description: 'B secret dinner',
      notes: 'B only notes', accountId: b.bankId, categoryId: b.groceriesId, date: '2026-09-22'
    }
  })).data.transaction;
  check('Setup: user B transaction', Boolean(bTxn));

  const fetchList = (params, token = tokenA) =>
    request('GET', `/api/transactions?${q(params)}`, { token });

  console.log('\nSearch (case-insensitive, backend)');
  check('Search description', has(await fetchList({ search: 'dinner' }), t1.id));
  check('Search description case-insensitive', has(await fetchList({ search: 'DINNER' }), t1.id));
  check('Search notes', has(await fetchList({ search: 'rahul' }), t1.id));
  check('Search reference', has(await fetchList({ search: 'UPI-9981' }), t1.id));
  check('Search reference case-insensitive', has(await fetchList({ search: 'upi-9981' }), t1.id));

  const byCategory = await fetchList({ search: a.groceriesName.split(' ')[0].toLowerCase() });
  check('Search category name',
    has(byCategory, t1.id) && has(byCategory, t4.id) && !has(byCategory, t3.id),
    JSON.stringify(ids(byCategory)));

  const byAccount = await fetchList({ search: 'hdfc' });
  check('Search account name (case-insensitive)',
    has(byAccount, t1.id) && has(byAccount, t2.id) && !has(byAccount, t4.id),
    JSON.stringify(ids(byAccount)));

  const emptySearch = await fetchList({ search: 'zzz-no-such-record-zzz' });
  check('Search with no matches returns empty page',
    emptySearch.data.transactions.length === 0 && emptySearch.data.pagination.total === 0);

  console.log('\nFilters');
  check('Filter by type', (await fetchList({ type: 'EXPENSE' })).data.transactions.every((t) => t.type === 'EXPENSE'));
  check('Filter by account', has(await fetchList({ accountId: a.walletId }), t4.id));
  check('Filter by account excludes other account', !(await fetchList({ accountId: a.walletId })).data.transactions.some((t) => t.id === t1.id));
  const byCategoryFilter = await fetchList({ categoryId: a.groceriesId });
  check('Filter by category', has(byCategoryFilter, t1.id) && has(byCategoryFilter, t4.id) && !has(byCategoryFilter, t2.id));
  const byDate = await fetchList({ startDate: '2026-09-28', endDate: '2026-09-28' });
  check('Filter by date range (single day, inclusive)',
    byDate.data.pagination.total === 1 && has(byDate, t4.id), JSON.stringify(ids(byDate)));
  const byRange = await fetchList({ startDate: '2026-09-20', endDate: '2026-09-27' });
  check('Filter by date range (multi day)', has(byRange, t1.id) && has(byRange, t2.id) && !has(byRange, t4.id));
  const byAmount = await fetchList({ minAmount: 400, maxAmount: 2000 });
  check('Filter by min/max amount', has(byAmount, t1.id) && has(byAmount, t2.id) && !has(byAmount, t4.id), JSON.stringify(ids(byAmount)));
  check('Filter minAmount only', has(await fetchList({ minAmount: 49000 }), t3.id));

  const badRange = await fetchList({ minAmount: 5000, maxAmount: 100 });
  check('minAmount > maxAmount rejected (400)', badRange.status === 400, `got ${badRange.status}`);

  const badType = await fetchList({ type: 'TRANSFER' });
  check('type=TRANSFER filter rejected (400)', badType.status === 400, `got ${badType.status}`);

  const badSort = await fetchList({ sortBy: 'userId; DROP TABLE' });
  check('Unknown sort field rejected (400)', badSort.status === 400, `got ${badSort.status}`);

  console.log('\nSorting');
  const amountAsc = await fetchList({ sortBy: 'amount', sortOrder: 'asc', limit: 100 });
  const amountDesc = await fetchList({ sortBy: 'amount', sortOrder: 'desc', limit: 100 });
  const ascAmounts = amountAsc.data.transactions.map((t) => t.amount);
  const descAmounts = amountDesc.data.transactions.map((t) => t.amount);
  check('Amount ascending', ascAmounts.every((v, i) => i === 0 || ascAmounts[i - 1] <= v), JSON.stringify(ascAmounts));
  check('Amount descending', descAmounts.every((v, i) => i === 0 || descAmounts[i - 1] >= v), JSON.stringify(descAmounts));
  check('Amount asc and desc are mirrors',
    JSON.stringify(ascAmounts) === JSON.stringify([...descAmounts].reverse()));

  const dateAsc = await fetchList({ sortBy: 'date', sortOrder: 'asc', limit: 100 });
  const dateDesc = await fetchList({ sortBy: 'date', sortOrder: 'desc', limit: 100 });
  const ascDates = dateAsc.data.transactions.map((t) => new Date(t.date).getTime());
  check('Date ascending', ascDates.every((v, i) => i === 0 || ascDates[i - 1] <= v), JSON.stringify(ascDates));
  check('Date descending mirrors ascending',
    JSON.stringify(ascDates) === JSON.stringify(dateDesc.data.transactions.map((t) => new Date(t.date).getTime()).reverse()));

  const createdAsc = await fetchList({ sortBy: 'createdAt', sortOrder: 'asc', limit: 100 });
  const createdDesc = await fetchList({ sortBy: 'createdAt', sortOrder: 'desc', limit: 100 });
  check('Created-date asc and desc are mirrors',
    JSON.stringify(ids(createdAsc)) === JSON.stringify([...ids(createdDesc)].reverse()));

  console.log('\nDetail view');
  const detail = await request('GET', `/api/transactions/${t1.id}`, { token: tokenA });
  const view = detail.data.transaction;
  check('Detail returns all user-facing fields',
    view.amount === 450 && view.notes === 'Split bill with Rahul' && view.reference === 'UPI-9981'
    && view.account?.name === 'HDFC Bank' && view.category?.name === a.groceriesName
    && view.date && view.createdAt && view.updatedAt,
    JSON.stringify(view));
  check('Detail hides internal userId', view.userId === undefined, `userId=${view.userId}`);

  const crossDetail = await request('GET', `/api/transactions/${t1.id}`, { token: tokenB });
  check("User B cannot read A's transaction (404)", crossDetail.status === 404, `got ${crossDetail.status}`);

  console.log('\nUpdate notes / reference / amount');
  const bankBeforeUpdate = await balanceOf(tokenA, a.bankId);
  const updated = await request('PUT', `/api/transactions/${t1.id}`, {
    token: tokenA,
    body: { amount: 500, notes: 'Updated note', reference: 'UPI-10000' }
  });
  check('Update returns new values',
    updated.status === 200 && updated.data.transaction.amount === 500
    && updated.data.transaction.notes === 'Updated note'
    && updated.data.transaction.reference === 'UPI-10000',
    JSON.stringify(updated.data));
  const bankAfterUpdate = await balanceOf(tokenA, a.bankId);
  check('Update applied the balance delta (−50)',
    approx(bankAfterUpdate, bankBeforeUpdate - 50), `${bankBeforeUpdate} -> ${bankAfterUpdate}`);

  console.log('\nDuplicate transaction');
  const bankBeforeDup = await balanceOf(tokenA, a.bankId);
  const dup = await request('POST', `/api/transactions/${t1.id}/duplicate`, { token: tokenA, body: {} });
  const dupTxn = dup.data.transaction;
  check('Duplicate created (201)', dup.status === 201, `got ${dup.status}`);
  check('Duplicate has a NEW id', dupTxn.id !== t1.id, `${dupTxn.id} vs ${t1.id}`);
  check('Duplicate keeps amount/description/notes/reference',
    dupTxn.amount === 500 && dupTxn.description === 'Dinner with friends'
    && dupTxn.notes === 'Updated note' && dupTxn.reference === 'UPI-10000');
  check('Duplicate is independent (its own createdAt)', Boolean(dupTxn.createdAt));
  const bankAfterDup = await balanceOf(tokenA, a.bankId);
  check('Duplicate applied its own balance impact (−500)',
    approx(bankAfterDup, bankBeforeDup - 500), `${bankBeforeDup} -> ${bankAfterDup}`);

  const dupWithDate = await request('POST', `/api/transactions/${t1.id}/duplicate`, {
    token: tokenA, body: { date: '2026-10-05' }
  });
  check('Duplicate accepts a new date',
    dupWithDate.status === 201 && dupWithDate.data.transaction.date.startsWith('2026-10-05'),
    JSON.stringify(dupWithDate.data.transaction?.date));

  const crossDup = await request('POST', `/api/transactions/${t1.id}/duplicate`, { token: tokenB });
  check("User B cannot duplicate A's transaction (404)", crossDup.status === 404, `got ${crossDup.status}`);

  console.log('\nOwnership');
  const crossUpdate = await request('PUT', `/api/transactions/${t1.id}`, {
    token: tokenB, body: { amount: 1 }
  });
  check("User B cannot update A's transaction (404)", crossUpdate.status === 404, `got ${crossUpdate.status}`);
  const crossDelete = await request('DELETE', `/api/transactions/${t1.id}`, { token: tokenB });
  check("User B cannot delete A's transaction (404)", crossDelete.status === 404, `got ${crossDelete.status}`);

  const crossList = await fetchList({}, tokenB);
  check("List never leaks A's rows", !has(crossList, t1.id) && crossList.data.transactions.every((t) => t.id !== t1.id));

  console.log('\nType validation');
  const transferPost = await request('POST', '/api/transactions', {
    token: tokenA,
    body: { type: 'TRANSFER', amount: 10, accountId: a.bankId, transferAccountId: a.walletId }
  });
  check('POST type=TRANSFER rejected with a pointer to /api/transfers',
    transferPost.status === 400 && JSON.stringify(transferPost.data).toLowerCase().includes('/api/transfers'),
    JSON.stringify(transferPost.data));

  console.log('\nBulk delete');
  const bulkA = [];
  for (let i = 0; i < 3; i += 1) {
    const res = await request('POST', '/api/transactions', {
      token: tokenA,
      body: {
        type: 'EXPENSE', amount: 100 + i, description: `Bulk ${i}`,
        accountId: a.walletId, categoryId: a.groceriesId, date: '2026-09-25'
      }
    });
    bulkA.push(res.data.transaction);
  }
  const walletBeforeBulk = await balanceOf(tokenA, a.walletId);

  const mixed = await request('POST', '/api/transactions/bulk-delete', {
    token: tokenA, body: { ids: [bulkA[0].id, bulkA[1].id, bTxn.id] }
  });
  check('Bulk delete with a foreign id fails (404)', mixed.status === 404, `got ${mixed.status}`);
  const walletAfterMixed = await balanceOf(tokenA, a.walletId);
  check('Failed bulk delete changed no balances', approx(walletAfterMixed, walletBeforeBulk),
    `${walletBeforeBulk} -> ${walletAfterMixed}`);
  const stillThere = await request('GET', `/api/transactions/${bulkA[0].id}`, { token: tokenA });
  check('Failed bulk delete removed nothing', stillThere.status === 200);

  const emptyBulk = await request('POST', '/api/transactions/bulk-delete', {
    token: tokenA, body: { ids: [] }
  });
  check('Empty id list rejected (400)', emptyBulk.status === 400, `got ${emptyBulk.status}`);

  const bulk = await request('POST', '/api/transactions/bulk-delete', {
    token: tokenA, body: { ids: [bulkA[0].id, bulkA[1].id, bulkA[2].id] }
  });
  check('Bulk delete succeeds', bulk.status === 200 && bulk.data.deleted === 3, JSON.stringify(bulk.data));
  const walletAfterBulk = await balanceOf(tokenA, a.walletId);
  check('Balances restored after bulk delete (+303)',
    approx(walletAfterBulk, walletBeforeBulk + 100 + 101 + 102), `${walletBeforeBulk} -> ${walletAfterBulk}`);
  const gone = await request('GET', `/api/transactions/${bulkA[0].id}`, { token: tokenA });
  check('Deleted rows are gone (404)', gone.status === 404, `got ${gone.status}`);

  console.log('\nSummary (DB aggregation, filter-aware)');
  const summary = await request('GET', `/api/transactions/summary?${q({ startDate: '2026-09-01', endDate: '2026-09-30' })}`, { token: tokenA });
  check('Summary reports income/expense from the database',
    summary.status === 200 && typeof summary.data.totalIncome === 'number'
    && typeof summary.data.totalExpenses === 'number',
    JSON.stringify(summary.data));
  check('Summary net = income − expenses',
    approx(summary.data.netSavings, summary.data.totalIncome - summary.data.totalExpenses));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('Suite crashed:', error);
  process.exit(1);
});
