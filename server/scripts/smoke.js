/**
 * LIVE SMOKE TEST (Phase 1 §7)
 * =============================
 * Exercises a RUNNING server over HTTP — the same checks an operator would
 * run after a deployment. Unlike the Vitest suite (which starts its own app
 * in-process), this hits a real, externally reachable API.
 *
 * It creates one throwaway user and verifies the money contract end to end:
 *   register -> create account -> create transaction -> check balance ->
 *   check summary -> check rejections -> check unauthenticated access.
 *
 * Usage:
 *   node scripts/smoke.js                       # http://localhost:3001
 *   node scripts/smoke.js http://host:port
 *
 * Exit code 0 = every check passed. Non-zero = at least one check failed.
 */

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

let failures = 0;

const check = (label, condition, detail = '') => {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`   ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const request = async (method, path, { token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
};

const main = async () => {
  console.log(`Smoke testing ${BASE}\n`);

  // 1. Health
  console.log('1. Health');
  const health = await request('GET', '/api/health');
  check('health returns ok', health.status === 200 && health.data?.status === 'ok');

  // 2. Security headers
  console.log('2. Security headers');
  check('X-Content-Type-Options', health.headers.get('x-content-type-options') === 'nosniff');
  check('Content-Security-Policy', Boolean(health.headers.get('content-security-policy')));
  check('X-Frame-Options', Boolean(health.headers.get('x-frame-options')));
  check('Referrer-Policy', Boolean(health.headers.get('referrer-policy')));
  check('framework version hidden', health.headers.get('x-powered-by') === null);

  // 3. Register
  console.log('3. Authentication');
  const email = `smoke_${Date.now()}@example.com`;
  const reg = await request('POST', '/api/auth/register', {
    body: { email, password: 'Password123!', name: 'Smoke Test' }
  });
  check('register succeeds', reg.status === 201, `status ${reg.status}`);
  const token = reg.data?.token;
  check('token issued', Boolean(token));
  if (!token) return;

  const h = { token };

  // 4. Money contract
  console.log('4. Money contract');
  const accountRes = await request('POST', '/api/accounts', {
    ...h,
    body: { name: 'Smoke Cash', type: 'CASH', balance: 1000.50, currency: 'INR' }
  });
  check('account created', accountRes.status === 201, `status ${accountRes.status}`);
  check('balance returned as decimal', accountRes.data?.account?.balance === 1000.5,
    `got ${accountRes.data?.account?.balance}`);
  const accountId = accountRes.data?.account?.id;

  const txnRes = await request('POST', '/api/transactions', {
    ...h,
    body: { type: 'EXPENSE', amount: 100.50, accountId, description: 'Smoke purchase' }
  });
  check('transaction created', txnRes.status === 201, `status ${txnRes.status}`);
  check('amount returned as decimal', txnRes.data?.transaction?.amount === 100.5,
    `got ${txnRes.data?.transaction?.amount}`);

  const accountsAfter = await request('GET', '/api/accounts', h);
  const balance = accountsAfter.data?.accounts?.[0]?.balance;
  check('balance is exact after the transaction', balance === 900, `expected 900, got ${balance}`);

  const summary = await request('GET', '/api/transactions/summary', h);
  check('summary expenses', summary.data?.totalExpenses === 100.5, `got ${summary.data?.totalExpenses}`);
  check('summary net', summary.data?.netSavings === -100.5, `got ${summary.data?.netSavings}`);

  // 5. Transfers are not income/expense
  console.log('5. Transfer isolation');
  const second = await request('POST', '/api/accounts', {
    ...h,
    body: { name: 'Smoke Bank', type: 'BANK', balance: 0, currency: 'INR' }
  });
  const transfer = await request('POST', '/api/transfers', {
    ...h,
    body: { fromAccountId: accountId, toAccountId: second.data?.account?.id, amount: 100 }
  });
  check('transfer created', transfer.status === 201, `status ${transfer.status}`);
  const summaryAfter = await request('GET', '/api/transactions/summary', h);
  check('transfer did not change income/expense', summaryAfter.data?.totalExpenses === 100.5,
    `got ${summaryAfter.data?.totalExpenses}`);

  // 6. Rejections
  console.log('6. Input validation');
  const negative = await request('POST', '/api/transactions', {
    ...h,
    body: { type: 'EXPENSE', amount: -5, accountId }
  });
  check('negative amount rejected', negative.status === 400, `status ${negative.status}`);

  const zero = await request('POST', '/api/transactions', {
    ...h,
    body: { type: 'EXPENSE', amount: 0, accountId }
  });
  check('zero amount rejected', zero.status === 400, `status ${zero.status}`);

  const unauth = await request('GET', '/api/transactions');
  check('unauthenticated request rejected', unauth.status === 401, `status ${unauth.status}`);

  const foreign = await request('GET', `/api/accounts/${accountId}`, {
    token: 'not-a-real-token'
  });
  check('invalid token rejected', foreign.status === 401, `status ${foreign.status}`);

  // 7. Other endpoints still respond
  console.log('7. Other endpoints');
  for (const path of ['/api/dashboard/summary', '/api/categories', '/api/budgets', '/api/reports/history']) {
    const res = await request('GET', path, h);
    check(`${path} responds`, res.status === 200, `status ${res.status}`);
  }

  console.log('');
  if (failures === 0) {
    console.log('SMOKE TEST PASSED');
  } else {
    console.log(`SMOKE TEST FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error('Smoke test could not run:', error.message);
  console.log('Is the server running? Start it with `npm run dev` (or `npm start`).');
  process.exitCode = 1;
});
