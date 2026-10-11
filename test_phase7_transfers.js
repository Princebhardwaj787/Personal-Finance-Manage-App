/* Phase 7 — Account transfers: balances, atomicity, ownership, security.
   Run with the API server on :3001 ->  node test_phase7_transfers.js */
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

const accountsOf = async (token) => (await request('GET', '/api/accounts', { token })).data.accounts || [];
const balanceOf = async (token, id) => {
  const account = (await accountsOf(token)).find((a) => a.id === id);
  return account ? account.balance : null;
};
const totalOf = async (token) =>
  (await accountsOf(token)).reduce((sum, a) => sum + a.balance, 0);

const createAccount = async (token, name, type, balance) => {
  const res = await request('POST', '/api/accounts', {
    token, body: { name, type, balance, currency: 'INR' }
  });
  return res.data.account;
};

async function run() {
  console.log('=== PHASE 7 · TRANSFERS ===\n');
  const stamp = Date.now();
  // UTC calendar date of today: the dashboard summary is period-scoped to the
  // current month, so fixture data must land inside it.
  const today = new Date().toISOString().slice(0, 10);
  const tokenA = await register(`p7_transfer_a_${stamp}@example.com`, 'Phase 7 A');
  const tokenB = await register(`p7_transfer_b_${stamp}@example.com`, 'Phase 7 B');

  const bank = await createAccount(tokenA, 'HDFC Bank', 'BANK', 20000);
  const cash = await createAccount(tokenA, 'Cash Wallet', 'CASH', 5000);
  const tiny = await createAccount(tokenA, 'Tiny Account', 'BANK', 100);
  const bBank = await createAccount(tokenB, 'B Bank', 'BANK', 1000);

  check('Setup: accounts created', Boolean(bank && cash && tiny && bBank));

  const txnCountBefore = (await request('GET', '/api/transactions?limit=100', { token: tokenA })).data.pagination.total;

  console.log('\nSecurity');
  const noAuth = await request('POST', '/api/transfers', {
    body: { fromAccountId: bank.id, toAccountId: cash.id, amount: 1 }
  });
  check('Unauthenticated transfer rejected (401)', noAuth.status === 401, `got ${noAuth.status}`);

  console.log('\nCreate transfer (Bank 20,000 -> Cash 5,000)');
  const totalBefore = await totalOf(tokenA);
  const created = await request('POST', '/api/transfers', {
    token: tokenA,
    body: {
      fromAccountId: bank.id, toAccountId: cash.id, amount: 3000,
      date: today, description: 'Moving money to savings account'
    }
  });  const transfer = created.data.transfer;
  check('Created (201)', created.status === 201, JSON.stringify(created.data));
  check('Response carries both account snapshots',
    transfer?.fromAccount?.name === 'HDFC Bank' && transfer?.toAccount?.name === 'Cash Wallet',
    JSON.stringify({ from: transfer?.fromAccount?.name, to: transfer?.toAccount?.name }));
  check('Description stored', transfer?.description === 'Moving money to savings account');

  const bankAfter = await balanceOf(tokenA, bank.id);
  const cashAfter = await balanceOf(tokenA, cash.id);
  const totalAfter = await totalOf(tokenA);
  check('Source balance decreased (17,000)', approx(bankAfter, 17000), `got ${bankAfter}`);
  check('Destination balance increased (8,000)', approx(cashAfter, 8000), `got ${cashAfter}`);
  check('TOTAL balance unchanged (25,100 = 20,000 + 5,000 + 100)',
    approx(totalBefore, 25100) && approx(totalAfter, totalBefore),
    `${totalBefore} -> ${totalAfter}`);

  const txnCountAfter = (await request('GET', '/api/transactions?limit=100', { token: tokenA })).data.pagination.total;
  check('Transfer created NO income/expense transaction', txnCountAfter === txnCountBefore,
    `${txnCountBefore} -> ${txnCountAfter}`);

  const summary = await request('GET', '/api/dashboard/summary', { token: tokenA });
  check('Dashboard totalTransfers reflects the transfer (3,000)',
    approx(summary.data.totalTransfers, 3000), `got ${summary.data.totalTransfers}`);
  check('Dashboard income NOT inflated by the transfer',
    summary.data.totalIncome === 0 && summary.data.totalExpenses === 0,
    JSON.stringify({ i: summary.data.totalIncome, e: summary.data.totalExpenses }));

  console.log('\nValidation');
  const sameAccount = await request('POST', '/api/transfers', {
    token: tokenA, body: { fromAccountId: bank.id, toAccountId: bank.id, amount: 100 }
  });
  check('Same source and destination rejected (400)', sameAccount.status === 400, `got ${sameAccount.status}`);

  const missingAccount = await request('POST', '/api/transfers', {
    token: tokenA, body: { fromAccountId: 'does-not-exist', toAccountId: cash.id, amount: 100 }
  });
  check('Unknown source account rejected (404)', missingAccount.status === 404, `got ${missingAccount.status}`);

  const crossUser = await request('POST', '/api/transfers', {
    token: tokenA, body: { fromAccountId: bank.id, toAccountId: bBank.id, amount: 100 }
  });
  check("Cross-user destination rejected (404)", crossUser.status === 404, `got ${crossUser.status}`);

  const crossUser2 = await request('POST', '/api/transfers', {
    token: tokenA, body: { fromAccountId: bBank.id, toAccountId: cash.id, amount: 100 }
  });
  check("Cross-user source rejected (404)", crossUser2.status === 404, `got ${crossUser2.status}`);

  const zeroAmount = await request('POST', '/api/transfers', {
    token: tokenA, body: { fromAccountId: bank.id, toAccountId: cash.id, amount: 0 }
  });
  check('Amount 0 rejected (400)', zeroAmount.status === 400, `got ${zeroAmount.status}`);

  const noBalance = await totalOf(tokenA);
  const overdraft = await request('POST', '/api/transfers', {
    token: tokenA, body: { fromAccountId: tiny.id, toAccountId: cash.id, amount: 500 }
  });
  const tinyAfter = await balanceOf(tokenA, tiny.id);
  const cashAfterFail = await balanceOf(tokenA, cash.id);
  check('Insufficient balance rejected (400)', overdraft.status === 400, `got ${overdraft.status}`);
  check('Error explains the shortfall', /insufficient balance/i.test(overdraft.data.error || ''),
    JSON.stringify(overdraft.data));
  check('ROLLBACK: no balance changed on failure',
    approx(tinyAfter, 100) && approx(cashAfterFail, 8000),
    `tiny=${tinyAfter} cash=${cashAfterFail}`);
  check('ROLLBACK: total unchanged on failure', approx(await totalOf(tokenA), noBalance),
    `got ${await totalOf(tokenA)}`);

  console.log('\nList / filters / search / sorting');
  const list = await request('GET', '/api/transfers', { token: tokenA });
  check('List returns the transfer', list.data.transfers?.length === 1
    && list.data.transfers[0].id === transfer.id, JSON.stringify(list.data));

  const byAccount = await request('GET', `/api/transfers?${q({ accountId: cash.id })}`, { token: tokenA });
  check('Account filter matches either side', byAccount.data.transfers.some((t) => t.id === transfer.id));

  const byOtherAccount = await request('GET', `/api/transfers?${q({ accountId: tiny.id })}`, { token: tokenA });
  check('Account filter excludes unrelated', byOtherAccount.data.transfers.length === 0);

  const bySearch = await request('GET', `/api/transfers?${q({ search: 'savings' })}`, { token: tokenA });
  check('Search matches description', bySearch.data.transfers.some((t) => t.id === transfer.id));

  const byAccountName = await request('GET', `/api/transfers?${q({ search: 'hdfc' })}`, { token: tokenA });
  check('Search matches account name (case-insensitive)',
    byAccountName.data.transfers.some((t) => t.id === transfer.id));

  const byDate = await request('GET', `/api/transfers?${q({ startDate: today, endDate: today })}`, { token: tokenA });
  check('Date filter (inclusive day)', byDate.data.transfers.length === 1, JSON.stringify(byDate.data));

  const amountAsc = await request('GET', `/api/transfers?${q({ sortBy: 'amount', sortOrder: 'asc' })}`, { token: tokenA });
  const amountDesc = await request('GET', `/api/transfers?${q({ sortBy: 'amount', sortOrder: 'desc' })}`, { token: tokenA });
  check('Sort whitelist works both ways',
    amountAsc.data.transfers[0].id === amountDesc.data.transfers[0].id);

  const badSort = await request('GET', `/api/transfers?${q({ sortBy: 'userId' })}`, { token: tokenA });
  check('Unknown sort field rejected (400)', badSort.status === 400, `got ${badSort.status}`);

  const transferSummary = await request('GET', '/api/transfers/summary', { token: tokenA });
  check('Transfer summary aggregates in SQL',
    transferSummary.status === 200 && approx(transferSummary.data.totalAmount, 3000)
    && transferSummary.data.count === 1, JSON.stringify(transferSummary.data));

  console.log('\nUpdate');
  const beforeUpdate = { bank: await balanceOf(tokenA, bank.id), cash: await balanceOf(tokenA, cash.id) };
  const updated = await request('PUT', `/api/transfers/${transfer.id}`, {
    token: tokenA, body: { amount: 4000 }
  });
  check('Update succeeds', updated.status === 200 && updated.data.transfer.amount === 4000,
    JSON.stringify(updated.data));
  check('Update adjusted balances (bank 16,000 / cash 9,000)',
    approx(await balanceOf(tokenA, bank.id), beforeUpdate.bank - 1000)
    && approx(await balanceOf(tokenA, cash.id), beforeUpdate.cash + 1000),
    `bank=${await balanceOf(tokenA, bank.id)} cash=${await balanceOf(tokenA, cash.id)}`);
  check('Update kept the total unchanged', approx(await totalOf(tokenA), 25100),
    `got ${await totalOf(tokenA)}`);

  const overdraftUpdate = await request('PUT', `/api/transfers/${transfer.id}`, {
    token: tokenA, body: { amount: 999999 }
  });
  check('Update beyond balance rejected (400)', overdraftUpdate.status === 400, `got ${overdraftUpdate.status}`);
  check('Rejected update left balances intact',
    approx(await balanceOf(tokenA, bank.id), 16000) && approx(await balanceOf(tokenA, cash.id), 9000),
    `bank=${await balanceOf(tokenA, bank.id)} cash=${await balanceOf(tokenA, cash.id)}`);

  console.log('\nDelete (reverses both sides)');
  const totalBeforeDelete = await totalOf(tokenA);
  const deleted = await request('DELETE', `/api/transfers/${transfer.id}`, { token: tokenA });
  check('Delete succeeds', deleted.status === 200, JSON.stringify(deleted.data));
  check('Source restored (20,000)', approx(await balanceOf(tokenA, bank.id), 20000),
    `got ${await balanceOf(tokenA, bank.id)}`);
  check('Destination restored (5,000)', approx(await balanceOf(tokenA, cash.id), 5000),
    `got ${await balanceOf(tokenA, cash.id)}`);
  check('Total unchanged by delete', approx(await totalOf(tokenA), totalBeforeDelete));
  const gone = await request('GET', `/api/transfers/${transfer.id}`, { token: tokenA });
  check('Deleted transfer is gone (404)', gone.status === 404, `got ${gone.status}`);

  console.log('\nLegacy endpoint /api/transactions/transfer');
  const legacy = await request('POST', '/api/transactions/transfer', {
    token: tokenA,
    body: { fromAccountId: bank.id, toAccountId: cash.id, amount: 500, description: 'Legacy path' }
  });
  check('Legacy path returns a Transfer (201)', legacy.status === 201 && legacy.data.transfer?.amount === 500,
    JSON.stringify(legacy.data));
  check('Legacy path no longer returns an expense/income pair',
    legacy.data.expense === undefined && legacy.data.income === undefined, JSON.stringify(legacy.data));
  check('Legacy path moved balances (19,500 / 5,500)',
    approx(await balanceOf(tokenA, bank.id), 19500) && approx(await balanceOf(tokenA, cash.id), 5500),
    `bank=${await balanceOf(tokenA, bank.id)} cash=${await balanceOf(tokenA, cash.id)}`);
  const legacyTxnCount = (await request('GET', '/api/transactions?limit=100', { token: tokenA })).data.pagination.total;
  check('Legacy path created NO income/expense rows', legacyTxnCount === txnCountBefore,
    `${txnCountBefore} -> ${legacyTxnCount}`);

  console.log('\nOwnership');
  const crossList = await request('GET', '/api/transfers', { token: tokenB });
  check("User B's list has none of A's transfers",
    (crossList.data.transfers || []).every((t) => t.id !== legacy.data.transfer.id));
  const crossGet = await request('GET', `/api/transfers/${legacy.data.transfer.id}`, { token: tokenB });
  check("User B cannot read A's transfer (404)", crossGet.status === 404, `got ${crossGet.status}`);
  const crossUpdate = await request('PUT', `/api/transfers/${legacy.data.transfer.id}`, {
    token: tokenB, body: { amount: 1 }
  });
  check("User B cannot update A's transfer (404)", crossUpdate.status === 404, `got ${crossUpdate.status}`);
  const crossDelete = await request('DELETE', `/api/transfers/${legacy.data.transfer.id}`, { token: tokenB });
  check("User B cannot delete A's transfer (404)", crossDelete.status === 404, `got ${crossDelete.status}`);

  console.log('\nFinal invariant');
  const finalTotal = await totalOf(tokenA);
  // 20,000 + 5,000 + 100 = 25,100 (one legacy transfer of 500 still stands)
  check('Net worth only reflects the standing transfer (25,100)', approx(finalTotal, 25100),
    `got ${finalTotal}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('Suite crashed:', error);
  process.exit(1);
});
