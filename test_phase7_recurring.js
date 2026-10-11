/* Phase 7 — Recurring transaction automation: frequencies, idempotency,
   due-date advancement, failures, catch-up cap, security.
   Run with the API server on :3001 ->  node test_phase7_recurring.js */
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
const day = (iso) => String(iso).slice(0, 10);

async function register(email, name) {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', name }
  });
  if (!res.data.token) throw new Error('Register failed: ' + JSON.stringify(res.data));
  return res.data.token;
}

async function run() {
  console.log('=== PHASE 7 · RECURRING AUTOMATION ===\n');
  const stamp = Date.now();
  const tokenA = await register(`p7_recurring_a_${stamp}@example.com`, 'Phase 7 A');
  const tokenB = await register(`p7_recurring_b_${stamp}@example.com`, 'Phase 7 B');
  const AS_OF = '2026-09-30';

  const acc = await request('POST', '/api/accounts', {
    token: tokenA, body: { name: 'Recurring Bank', type: 'BANK', balance: 1000000, currency: 'INR' }
  });
  const poor = await request('POST', '/api/accounts', {
    token: tokenA, body: { name: 'Poor Bank', type: 'BANK', balance: 10, currency: 'INR' }
  });
  const cat = await request('POST', '/api/categories', {
    token: tokenA, body: { name: `Bills ${stamp}`, type: 'EXPENSE', icon: '🔁', color: '#6366f1' }
  });
  const accB = await request('POST', '/api/accounts', {
    token: tokenB, body: { name: 'B Bank', type: 'BANK', balance: 5000, currency: 'INR' }
  });
  const catB = await request('POST', '/api/categories', {
    token: tokenB, body: { name: `B Bills ${stamp}`, type: 'EXPENSE', icon: '🔁', color: '#6366f1' }
  });

  const bankId = acc.data.account.id;
  const poorId = poor.data.account.id;
  const catId = cat.data.category.id;
  const balanceOf = async (id) => {
    const list = (await request('GET', '/api/accounts', { token: tokenA })).data.accounts || [];
    const account = list.find((a) => a.id === id);
    return account ? account.balance : null;
  };

  const createItem = async (token, payload) => {
    const res = await request('POST', '/api/recurring-expenses', {
      token,
      body: { accountId: bankId, categoryId: catId, ...payload }
    });
    return res.data.recurringExpense;
  };
  const processRun = (token = tokenA, body = { asOfDate: AS_OF }) =>
    request('POST', '/api/recurring-expenses/process', { token, body });
  const items = async (token = tokenA) =>
    (await request('GET', '/api/recurring-expenses', { token })).data.recurringExpenses || [];
  const txnIdsFor = async (itemId) => {
    const list = (await request('GET', '/api/transactions?limit=100', { token: tokenA })).data.transactions || [];
    return list.filter((t) => t.recurringExpenseId === itemId);
  };

  console.log('\nSecurity');
  const noAuth = await request('POST', '/api/recurring-expenses/process', { body: {} });
  check('Unauthenticated processor call rejected (401)', noAuth.status === 401, `got ${noAuth.status}`);
  const foreignAccount = await request('POST', '/api/recurring-expenses', {
    token: tokenB,
    body: { name: 'Leak', amount: 1, frequency: 'MONTHLY', nextDueDate: '2026-09-01', accountId: bankId, categoryId: catB.data.category.id }
  });
  check("User B cannot point an item at A's account", foreignAccount.status >= 400 && foreignAccount.status < 500,
    `got ${foreignAccount.status}`);

  console.log('\nScenario 1 — one due MONTHLY occurrence');
  const netflix = await createItem(tokenA, {
    name: 'Netflix', amount: 649, frequency: 'MONTHLY',
    nextDueDate: '2026-09-01', description: 'Streaming plan'
  });
  check('Item created', Boolean(netflix?.id), JSON.stringify(netflix));
  const balanceStart = await balanceOf(bankId);

  const run1 = await processRun();
  check('Processor reports 1 item due', run1.status === 200 && run1.data.itemsDue === 1, JSON.stringify({
    status: run1.status, itemsDue: run1.data.itemsDue, created: run1.data.created
  }));
  check('Created 1 occurrence, 0 failed', run1.data.created === 1 && run1.data.failed === 0,
    JSON.stringify({ created: run1.data.created, failed: run1.data.failed, skipped: run1.data.skipped }));
  const occ1 = run1.data.results[0].occurrences[0];
  check('Occurrence date = due date (2026-09-01)', occ1.dueDate === '2026-09-01', JSON.stringify(occ1));
  check('Occurrence outcome created with transaction id', occ1.outcome === 'created' && Boolean(occ1.transactionId),
    JSON.stringify(occ1));
  check('Due date advanced to 2026-10-01', day(run1.data.results[0].nextDueDate) === '2026-10-01',
    `got ${run1.data.results[0].nextDueDate}`);
  check('Account debited by 649', approx(await balanceOf(bankId), balanceStart - 649),
    `got ${await balanceOf(bankId)}`);

  const genTxn = await request('GET', `/api/transactions/${occ1.transactionId}`, { token: tokenA });
  const g = genTxn.data.transaction;
  check('Generated row is an EXPENSE on the right date',
    g.type === 'EXPENSE' && day(g.date) === '2026-09-01' && g.amount === 649, JSON.stringify(g && { t: g.type, d: g.date }));
  check('Generated row is linked to the recurring item', g.recurringExpenseId === netflix.id);
  check('Generated row is marked auto-generated in the UI', g.isAutoGenerated === true);
  check('Generated row carries an explanatory note', /Auto-generated from recurring payment/.test(g.notes || ''),
    JSON.stringify(g.notes));

  console.log('\nScenario 2 — running twice never charges twice');
  const reset = await request('PUT', `/api/recurring-expenses/${netflix.id}`, {
    token: tokenA, body: { nextDueDate: '2026-09-01' }
  });
  check('Schedule reset for the idempotency test', reset.status === 200, `got ${reset.status}`);
  const balanceBeforeSecond = await balanceOf(bankId);
  const run2 = await processRun();
  check('Second run created nothing', run2.data.created === 0, JSON.stringify(run2.data));
  const occ2 = run2.data.results[0].occurrences[0];
  check('Second run reported the occurrence as already processed',
    occ2.outcome === 'skipped' && /already processed/i.test(occ2.reason || ''), JSON.stringify(occ2));
  check('Balance untouched by the second run', approx(await balanceOf(bankId), balanceBeforeSecond),
    `got ${await balanceOf(bankId)}`);
  check('Still exactly ONE transaction for this item', (await txnIdsFor(netflix.id)).length === 1,
    `got ${(await txnIdsFor(netflix.id)).length}`);
  check('Stale schedule repaired back to 2026-10-01',
    day(run2.data.results[0].nextDueDate) === '2026-10-01', `got ${run2.data.results[0].nextDueDate}`);

  console.log('\nScenario 3 — all four frequencies');
  const weekly = await createItem(tokenA, { name: 'Gym weekly', amount: 100, frequency: 'WEEKLY', nextDueDate: '2026-09-01' });
  const monthly = await createItem(tokenA, { name: 'Rent', amount: 200, frequency: 'MONTHLY', nextDueDate: '2026-07-15' });
  const quarterly = await createItem(tokenA, { name: 'Insurance', amount: 300, frequency: 'QUARTERLY', nextDueDate: '2026-03-10' });
  const yearly = await createItem(tokenA, { name: 'Domain renewal', amount: 400, frequency: 'YEARLY', nextDueDate: '2025-05-05' });
  check('Four frequency items created',
    Boolean(weekly && monthly && quarterly && yearly));

  const balanceBeforeFreq = await balanceOf(bankId);
  const run3 = await processRun();
  // weekly: Sep 1,8,15,22,29 = 5 · monthly: Jul 15, Aug 15, Sep 15 = 3
  // quarterly: Mar 10, Jun 10, Sep 10 = 3 · yearly: 2025-05-05, 2026-05-05 = 2
  check('Created 13 occurrences across four frequencies (5+3+3+2)',
    run3.data.created === 13, JSON.stringify({ created: run3.data.created, results: run3.data.results.map((r) => [r.name, r.occurrences.length]) }));
  check('Debited 2,800 in total', approx(await balanceOf(bankId), balanceBeforeFreq - 2800),
    `got ${await balanceOf(bankId)}`);

  const itemResult = (res, id) => res.data.results.find((r) => r.id === id);
  const datesOf = (res, id) => (itemResult(res, id)?.occurrences || []).map((o) => o.dueDate);
  check('WEEKLY dates are 7 days apart',
    JSON.stringify(datesOf(run3, weekly.id)) === JSON.stringify(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']),
    JSON.stringify(datesOf(run3, weekly.id)));
  check('MONTHLY dates step by a month',
    JSON.stringify(datesOf(run3, monthly.id)) === JSON.stringify(['2026-07-15', '2026-08-15', '2026-09-15']),
    JSON.stringify(datesOf(run3, monthly.id)));
  check('QUARTERLY dates step by 3 months',
    JSON.stringify(datesOf(run3, quarterly.id)) === JSON.stringify(['2026-03-10', '2026-06-10', '2026-09-10']),
    JSON.stringify(datesOf(run3, quarterly.id)));
  check('YEARLY dates step by a year',
    JSON.stringify(datesOf(run3, yearly.id)) === JSON.stringify(['2025-05-05', '2026-05-05']),
    JSON.stringify(datesOf(run3, yearly.id)));
  check('Due dates advanced past the as-of date',
    day(itemResult(run3, weekly.id).nextDueDate) === '2026-10-06'
    && day(itemResult(run3, monthly.id).nextDueDate) === '2026-10-15'
    && day(itemResult(run3, quarterly.id).nextDueDate) === '2026-12-10'
    && day(itemResult(run3, yearly.id).nextDueDate) === '2027-05-05',
    JSON.stringify([weekly, monthly, quarterly, yearly].map((i) => itemResult(run3, i.id)?.nextDueDate)));
  check('One transaction per occurrence (5 for weekly)', (await txnIdsFor(weekly.id)).length === 5);
  check('Quarterly transactions carry quarter dates',
    (await txnIdsFor(quarterly.id)).map((t) => day(t.date)).sort().join(',') === '2026-03-10,2026-06-10,2026-09-10',
    JSON.stringify((await txnIdsFor(quarterly.id)).map((t) => day(t.date))));

  console.log('\nScenario 4 — missed-occurrence catch-up with a cap');
  const magazine = await createItem(tokenA, { name: 'Magazine', amount: 50, frequency: 'WEEKLY', nextDueDate: '2026-06-01' });
  const balanceBeforeCap = await balanceOf(bankId);
  const run4 = await processRun(tokenA, { asOfDate: AS_OF, maxCatchUp: 5 });
  const magazineResult = itemResult(run4, magazine.id);
  check('Cap honoured: only 5 of ~19 missed occurrences created',
    run4.data.created === 5 && magazineResult.occurrences.length === 5,
    JSON.stringify({ created: run4.data.created, occurrences: magazineResult?.occurrences.length }));
  check('Response flags that more are still due', magazineResult.moreDue === true && run4.data.capped === true,
    JSON.stringify({ moreDue: magazineResult?.moreDue, capped: run4.data.capped }));
  check('Due date advanced only past what was created (2026-07-06)',
    day(magazineResult.nextDueDate) === '2026-07-06', `got ${magazineResult.nextDueDate}`);
  check('Capped run debited 250', approx(await balanceOf(bankId), balanceBeforeCap - 250),
    `got ${await balanceOf(bankId)}`);

  const run4b = await processRun(tokenA, { asOfDate: AS_OF, maxCatchUp: 5 });
  check('Next run continues the catch-up (5 more)', run4b.data.created === 5,
    JSON.stringify({ created: run4b.data.created }));
  check('Catch-up is idempotent across runs (10 rows total, no repeats)',
    (await txnIdsFor(magazine.id)).length === 10, `got ${(await txnIdsFor(magazine.id)).length}`);
  check('Continued catch-up advanced the due date to 2026-08-10',
    day(itemResult(run4b, magazine.id).nextDueDate) === '2026-08-10',
    `got ${itemResult(run4b, magazine.id)?.nextDueDate}`);

  console.log('\nScenario 5 — failure is recorded, due date NOT advanced');
  const gym = await createItem(tokenA, {
    name: 'Gym membership', amount: 500, frequency: 'MONTHLY',
    nextDueDate: '2026-09-01', accountId: poorId
  });
  const poorBalanceBefore = await balanceOf(poorId);
  const run5 = await processRun();
  const gymResult = itemResult(run5, gym.id);
  const gymOcc = gymResult?.occurrences[0];
  check('Insufficient balance reported as a failure',
    run5.data.failed >= 1 && gymOcc?.outcome === 'failed', JSON.stringify({ failed: run5.data.failed, gymOcc }));
  check('Failure reason is user-readable', /insufficient balance/i.test(gymOcc?.reason || ''),
    JSON.stringify(gymOcc?.reason));
  check('NO transaction was created for the failed occurrence',
    (await txnIdsFor(gym.id)).length === 0, `got ${(await txnIdsFor(gym.id)).length}`);
  check('Account balance untouched', approx(await balanceOf(poorId), poorBalanceBefore),
    `got ${await balanceOf(poorId)}`);
  check('Due date NOT advanced on failure (still 2026-09-01)',
    day(gymResult.nextDueDate) === '2026-09-01', `got ${gymResult.nextDueDate}`);

  const occurrences = await request('GET', `/api/recurring-expenses/${gym.id}/occurrences`, { token: tokenA });
  const failedOcc = (occurrences.data.occurrences || [])[0];
  check('Failure log exposed via /occurrences', occurrences.status === 200 && failedOcc?.status === 'FAILED',
    JSON.stringify(occurrences.data));
  check('Failure log stores the reason + attempt count',
    failedOcc.attemptCount === 1 && /insufficient balance/i.test(failedOcc.failureReason || ''),
    JSON.stringify(failedOcc));

  const run5b = await processRun();
  const occurrencesAfter = await request('GET', `/api/recurring-expenses/${gym.id}/occurrences`, { token: tokenA });
  check('Retry increments the attempt counter (2) without duplicating rows',
    occurrencesAfter.data.count === 1 && occurrencesAfter.data.occurrences[0].attemptCount === 2,
    JSON.stringify({ count: occurrencesAfter.data.count, attempt: occurrencesAfter.data.occurrences[0]?.attemptCount }));
  check('Retry still created nothing', (await txnIdsFor(gym.id)).length === 0);
  check('Retry still did not advance the due date',
    day(itemResult(run5b, gym.id).nextDueDate) === '2026-09-01', JSON.stringify(itemResult(run5b, gym.id)?.nextDueDate));

  console.log('\nScenario 6 — paused items are not processed');
  const magazineCountBeforePause = (await txnIdsFor(magazine.id)).length;
  const pause = await request('PUT', `/api/recurring-expenses/${magazine.id}`, {
    token: tokenA, body: { isActive: false }
  });
  check('Item paused', pause.status === 200 && pause.data.recurringExpense.isActive === false,
    JSON.stringify(pause.data));
  const run6 = await processRun();
  check('Paused item absent from the run', !run6.data.results.some((r) => r.id === magazine.id),
    JSON.stringify(run6.data.results.map((r) => r.name)));
  check('Paused item row count unchanged by the run',
    (await txnIdsFor(magazine.id)).length === magazineCountBeforePause,
    `${magazineCountBeforePause} -> ${(await txnIdsFor(magazine.id)).length}`);

  console.log('\nScenario 7 — dry run writes nothing');
  const dry = await createItem(tokenA, { name: 'Dry run item', amount: 77, frequency: 'MONTHLY', nextDueDate: '2026-09-01' });
  const balanceBeforeDry = await balanceOf(bankId);
  const run7 = await processRun(tokenA, { asOfDate: AS_OF, dryRun: true });
  const dryResult = itemResult(run7, dry.id);
  check('Dry run flags itself', run7.data.dryRun === true, JSON.stringify(run7.data.dryRun));
  check('Dry run previews a creation', dryResult?.occurrences[0]?.outcome === 'would-create',
    JSON.stringify(dryResult?.occurrences));
  check('Dry run created no transaction', (await txnIdsFor(dry.id)).length === 0,
    `got ${(await txnIdsFor(dry.id)).length}`);
  check('Dry run changed no balances', approx(await balanceOf(bankId), balanceBeforeDry),
    `got ${await balanceOf(bankId)}`);
  check('Dry run left the due date untouched',
    day((await items()).find((i) => i.id === dry.id)?.nextDueDate) === '2026-09-01');

  const run7b = await processRun();
  check('Real run after the preview creates it (1)', run7b.data.created >= 1
    && (await txnIdsFor(dry.id)).length === 1, JSON.stringify({ created: run7b.data.created }));

  console.log('\nScenario 8 — cross-user isolation');
  const aStateBefore = JSON.stringify((await items()).map((i) => [i.id, i.nextDueDate]));
  const runB = await processRun(tokenB);
  check("User B's run sees no due items", runB.status === 200 && runB.data.itemsDue === 0,
    JSON.stringify({ status: runB.status, itemsDue: runB.data.itemsDue }));
  const aStateAfter = JSON.stringify((await items()).map((i) => [i.id, i.nextDueDate]));
  check("User B's run changed nothing of A's", aStateBefore === aStateAfter);
  const crossOccurrences = await request('GET', `/api/recurring-expenses/${netflix.id}/occurrences`, { token: tokenB });
  check("User B cannot read A's occurrence log (404)", crossOccurrences.status === 404,
    `got ${crossOccurrences.status}`);
  const crossItem = await request('GET', `/api/recurring-expenses/${netflix.id}`, { token: tokenB });
  check("User B cannot read A's recurring item (404)", crossItem.status === 404, `got ${crossItem.status}`);

  console.log('\nGenerated rows visible in the transaction list');
  const search = await request('GET', `/api/transactions?${q({ search: 'Auto-generated' })}`, { token: tokenA });
  check('Auto-generated rows are searchable by their note', search.data.pagination.total > 0,
    JSON.stringify(search.data.pagination));
  check('Every auto-generated row carries the recurring link',
    search.data.transactions.every((t) => Boolean(t.recurringExpenseId)));

  const finalList = await items();
  // The gym item is the deliberately-failing one (poor balance): its due date
  // must stay put. Every other active item should have caught up.
  check('Every successfully processed item ended with a future due date',
    finalList.filter((i) => i.isActive && i.id !== gym.id)
      .every((i) => new Date(i.nextDueDate) > new Date('2026-09-30T23:59:59Z')),
    JSON.stringify(finalList.filter((i) => i.isActive).map((i) => [i.name, i.nextDueDate])));
  check('Failing item still parked on its original due date',
    day(finalList.find((i) => i.id === gym.id)?.nextDueDate) === '2026-09-01');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('Suite crashed:', error);
  process.exit(1);
});
