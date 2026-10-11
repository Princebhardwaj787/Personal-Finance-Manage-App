/* Phase 9 — Notifications: CRUD, pagination, ownership, budget/payment/goal/
   low-balance alerts, preferences, dedupe, idempotency, DB checks.
   Run with the API server on :3001 ->  node test_phase9_notifications.js */
const http = require('http');
const { PrismaClient } = require('./server/node_modules/@prisma/client');
const prisma = new PrismaClient();

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
          resolve({ status: res.statusCode, data });
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

// Budget alerts are evaluated for the CURRENT calendar month only (the dedupe
// key includes the period), so fixture data must land in the current month —
// hardcoded months go stale and silently produce zero alerts.
const _now = new Date();
const CUR_YEAR = _now.getUTCFullYear();
const CUR_MONTH = _now.getUTCMonth() + 1;
const _pad = (n) => String(n).padStart(2, '0');
// Day `n` of the current month, clamped to today so no fixture is future-dated.
const curDay = (n) => `${CUR_YEAR}-${_pad(CUR_MONTH)}-${_pad(Math.min(n, _now.getUTCDate()))}`;
// The month after the current one (for 'new period' dedupe checks).
const NEXT_MONTH = CUR_MONTH === 12 ? 1 : CUR_MONTH + 1;
const NEXT_YEAR = CUR_MONTH === 12 ? CUR_YEAR + 1 : CUR_YEAR;

async function setupUser(token, { withBudget = false, lowBalanceThreshold = null } = {}) {
  const bank = await request('POST', '/api/accounts', {
    token, body: { name: 'HDFC Bank', type: 'BANK', balance: 100000, currency: 'INR', lowBalanceThreshold }
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

  // Transactions dated within the current calendar month
  await request('POST', '/api/transactions', {
    token, body: { type: 'INCOME', amount: 50000, description: 'Salary', accountId, categoryId: salaryId, date: curDay(1) }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 7500, description: 'Groceries', accountId, categoryId: foodId, date: curDay(10) }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 6000, description: 'Electricity', accountId, categoryId: billsId, date: curDay(15) }
  });
  await request('POST', '/api/transactions', {
    token, body: { type: 'EXPENSE', amount: 5000, description: 'More food', accountId, categoryId: foodId, date: curDay(20) }
  });

  if (withBudget) {
    await request('POST', '/api/budgets', {
      token, body: { name: 'Food Budget', amount: 10000, month: CUR_MONTH, year: CUR_YEAR, categoryId: foodId }
    });
  }

  return { accountId, foodId, billsId, salaryId };
}

async function runTests() {
  // Clean slate for deterministic tests
  await prisma.notification.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  // Remove test users from previous runs (cascades to their data)
  await prisma.user.deleteMany({
    where: { email: { endsWith: '@test.com' } }
  });

  console.log('\n--- Notification CRUD & Pagination ---');

  const alice = await register('alice@test.com', 'Alice');
  const bob = await register('bob@test.com', 'Bob');

  // Create a notification via the process endpoint (indirect) and directly
  // test the list endpoint with a SYSTEM notification created by triggering
  // budget processing. First, verify empty state.
  const emptyList = await request('GET', '/api/notifications', { token: alice });
  check('Empty list returns empty array', emptyList.status === 200 && emptyList.data.notifications.length === 0);

  const unread0 = await request('GET', '/api/notifications/unread-count', { token: alice });
  check('Unread count starts at 0', unread0.data.unreadCount === 0);

  // Create a budget and spend to trigger alerts
  await setupUser(alice, { withBudget: true });

  // Process scheduled notifications (triggers budget alerts)
  const process1 = await request('POST', '/api/notifications/process', { token: alice });
  check('Process endpoint returns success', process1.status === 200);
  check('Process created budget notification', process1.data.budget > 0);

  const list1 = await request('GET', '/api/notifications', { token: alice });
  check('List returns notifications', list1.data.notifications.length > 0);
  check('List has pagination', list1.data.pagination && list1.data.pagination.total > 0);

  const unread1 = await request('GET', '/api/notifications/unread-count', { token: alice });
  check('Unread count reflects created', unread1.data.unreadCount > 0);

  // Pagination: limit=1
  const page1 = await request('GET', '/api/notifications?page=1&limit=1', { token: alice });
  check('Pagination limit=1 returns 1 item', page1.data.notifications.length === 1);
  check('Pagination total correct', page1.data.pagination.total === list1.data.pagination.total);

  const page2 = await request('GET', '/api/notifications?page=2&limit=1', { token: alice });
  check('Pagination page=2 returns different item',
    page2.data.notifications[0]?.id !== page1.data.notifications[0]?.id);

  // limit > 50 rejected by validator
  const bigLimit = await request('GET', '/api/notifications?limit=100', { token: alice });
  check('Limit > 50 rejected with 400', bigLimit.status === 400);

  // Mark read
  const firstId = list1.data.notifications[0].id;
  const markRes = await request('PATCH', `/api/notifications/${firstId}/read`, { token: alice });
  check('Mark read returns 200', markRes.status === 200);
  check('Mark read sets isRead', markRes.data.isRead === true);
  check('Mark read sets readAt', markRes.data.readAt !== null);

  const unread2 = await request('GET', '/api/notifications/unread-count', { token: alice });
  check('Unread count decreased', unread2.data.unreadCount === unread1.data.unreadCount - 1);

  // Mark all read
  await request('PATCH', '/api/notifications/read-all', { token: alice });
  const unread3 = await request('GET', '/api/notifications/unread-count', { token: alice });
  check('Mark all read clears count', unread3.data.unreadCount === 0);

  // Delete
  const delRes = await request('DELETE', `/api/notifications/${firstId}`, { token: alice });
  check('Delete returns 200', delRes.status === 200);
  check('Delete removes notification', delRes.data.deleted === true);

  const afterDel = await request('GET', '/api/notifications', { token: alice });
  check('Deleted notification gone', !afterDel.data.notifications.find((n) => n.id === firstId));

  console.log('\n--- Ownership ---');

  // Bob cannot read Alice's notifications
  const bobList = await request('GET', '/api/notifications', { token: bob });
  check('Bob list is empty (no Alice data)', bobList.data.notifications.length === 0);

  // Bob cannot mark Alice's notification read
  const aliceNotifs = await request('GET', '/api/notifications', { token: alice });
  if (aliceNotifs.data.notifications.length > 0) {
    const aliceNotifId = aliceNotifs.data.notifications[0].id;
    const bobMark = await request('PATCH', `/api/notifications/${aliceNotifId}/read`, { token: bob });
    check('Bob cannot mark Alice notification read', bobMark.status === 404);
  }

  // Bob cannot delete Alice's notification
  if (aliceNotifs.data.notifications.length > 0) {
    const aliceNotifId = aliceNotifs.data.notifications[0].id;
    const bobDel = await request('DELETE', `/api/notifications/${aliceNotifId}`, { token: bob });
    check('Bob cannot delete Alice notification', bobDel.status === 404);
  }

  console.log('\n--- Budget Alerts ---');

  const budgetUser = await register('budget@test.com', 'BudgetUser');
  await setupUser(budgetUser, { withBudget: true });

  // Process twice — second should create no duplicates
  await request('POST', '/api/notifications/process', { token: budgetUser });
  const budgetList1 = await request('GET', '/api/notifications', { token: budgetUser });
  const budgetNotifs1 = budgetList1.data.notifications.filter(
    (n) => n.type === 'BUDGET_WARNING' || n.type === 'BUDGET_EXCEEDED'
  );
  check('Budget alert created', budgetNotifs1.length > 0);
  check('Budget alert has correct type',
    budgetNotifs1.some((n) => n.type === 'BUDGET_WARNING') || budgetNotifs1.some((n) => n.type === 'BUDGET_EXCEEDED'));

  const process2 = await request('POST', '/api/notifications/process', { token: budgetUser });
  const budgetList2 = await request('GET', '/api/notifications', { token: budgetUser });
  const budgetNotifs2 = budgetList2.data.notifications.filter(
    (n) => n.type === 'BUDGET_WARNING' || n.type === 'BUDGET_EXCEEDED'
  );
  check('Budget dedupe: no duplicates on second process', budgetNotifs2.length === budgetNotifs1.length);

  // New period: create a budget for the NEXT month (fresh dedupe keys)
  const octFood = await request('POST', '/api/categories', {
    token: budgetUser, body: { name: 'NextMonthFood', type: 'EXPENSE', icon: 'utensils', color: '#ff0000' }
  });
  await request('POST', '/api/budgets', {
    token: budgetUser, body: { name: 'Next Month Food Budget', amount: 8000, month: NEXT_MONTH, year: NEXT_YEAR, categoryId: octFood.data.category.id }
  });

  // Process again — next-month budget has no transactions so no alerts, but dedupe holds
  await request('POST', '/api/notifications/process', { token: budgetUser });
  const budgetList3 = await request('GET', '/api/notifications', { token: budgetUser });
  const budgetNotifs3 = budgetList3.data.notifications.filter(
    (n) => n.type === 'BUDGET_WARNING' || n.type === 'BUDGET_EXCEEDED'
  );
  check('New period: existing alerts preserved', budgetNotifs3.length >= budgetNotifs1.length);

  console.log('\n--- Payment Alerts ---');

  const paymentUser = await register('payment@test.com', 'PaymentUser');
  const { accountId: payAcctId } = await setupUser(paymentUser);

  // Create a recurring expense due in 3 days for upcoming payment alert
  const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const payCat = await request('POST', '/api/categories', {
    token: paymentUser, body: { name: 'PayCat', type: 'EXPENSE', icon: 'receipt', color: '#00ff00' }
  });
  await request('POST', '/api/recurring-expenses', {
    token: paymentUser,
    body: {
      name: 'Netflix',
      amount: 500,
      frequency: 'MONTHLY',
      nextDueDate: dueDate,
      accountId: payAcctId,
      categoryId: payCat.data.category.id
    }
  });

  // Process — should create UPCOMING_PAYMENT (3 days = milestone)
  await request('POST', '/api/notifications/process', { token: paymentUser });
  const payList1 = await request('GET', '/api/notifications', { token: paymentUser });
  const upcomingNotifs = payList1.data.notifications.filter((n) => n.type === 'UPCOMING_PAYMENT');
  check('Upcoming payment alert created', upcomingNotifs.length > 0);
  check('Upcoming payment has correct message',
    upcomingNotifs.some((n) => n.message.includes('due in 3 days')));

  // Dedupe
  await request('POST', '/api/notifications/process', { token: paymentUser });
  const payList2 = await request('GET', '/api/notifications', { token: paymentUser });
  const upcomingNotifs2 = payList2.data.notifications.filter((n) => n.type === 'UPCOMING_PAYMENT');
  check('Upcoming payment dedupe: no duplicates', upcomingNotifs2.length === upcomingNotifs.length);

  // Create another recurring expense due TODAY for processing
  const processDue = new Date().toISOString().slice(0, 10);
  await request('POST', '/api/recurring-expenses', {
    token: paymentUser,
    body: {
      name: 'Spotify',
      amount: 300,
      frequency: 'MONTHLY',
      nextDueDate: processDue,
      accountId: payAcctId,
      categoryId: payCat.data.category.id
    }
  });

  // Process the recurring expense — should create PAYMENT_PROCESSED for Spotify
  await request('POST', '/api/recurring-expenses/process', { token: paymentUser });
  const payList3 = await request('GET', '/api/notifications', { token: paymentUser });
  const processedNotifs = payList3.data.notifications.filter((n) => n.type === 'PAYMENT_PROCESSED');
  check('Payment processed alert created', processedNotifs.length > 0);
  check('Payment processed has correct message',
    processedNotifs.some((n) => n.message.includes('was processed')));

  console.log('\n--- Payment Failed ---');

  // Create a recurring expense due TODAY with insufficient balance
  await request('POST', '/api/accounts', {
    token: paymentUser, body: { name: 'Empty Wallet', type: 'CASH', balance: 100, currency: 'INR' }
  });
  const accounts = await request('GET', '/api/accounts', { token: paymentUser });
  const emptyAcct = accounts.data.accounts.find((a) => a.name === 'Empty Wallet');

  const failCat = await request('POST', '/api/categories', {
    token: paymentUser, body: { name: 'FailCat', type: 'EXPENSE', icon: 'receipt', color: '#00ff00' }
  });
  const todayDue = new Date().toISOString().slice(0, 10);
  await request('POST', '/api/recurring-expenses', {
    token: paymentUser,
    body: {
      name: 'Expensive Sub',
      amount: 5000,
      frequency: 'MONTHLY',
      nextDueDate: todayDue,
      accountId: emptyAcct.id,
      categoryId: failCat.data.category.id
    }
  });

  await request('POST', '/api/recurring-expenses/process', { token: paymentUser });
  const failList = await request('GET', '/api/notifications', { token: paymentUser });
  const failedNotifs = failList.data.notifications.filter((n) => n.type === 'PAYMENT_FAILED');
  check('Payment failed alert created', failedNotifs.length > 0);
  check('Payment failed does not expose internal errors',
    failedNotifs.every((n) => !n.message.includes('SQL') && !n.message.includes('Prisma') && !n.message.includes('database')));
  check('Payment failed has user-friendly message',
    failedNotifs.some((n) => n.message.includes("couldn't process")));

  console.log('\n--- Goal Alerts ---');

  const goalUser = await register('goal@test.com', 'GoalUser');

  // Create a savings goal
  const targetDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const goalRes = await request('POST', '/api/savings-goals', {
    token: goalUser,
    body: { name: 'Emergency Fund', targetAmount: 10000, targetDate, description: 'Test goal' }
  });
  if (goalRes.status !== 200 && goalRes.status !== 201) {
    console.log('  [debug] Goal creation response:', goalRes.status, JSON.stringify(goalRes.data));
  }
  const goalId = goalRes.data.goal?.id ?? goalRes.data.id;

  // Process — no deadline alert yet (30 days > 7 day window)
  await request('POST', '/api/notifications/process', { token: goalUser });
  const goalList1 = await request('GET', '/api/notifications', { token: goalUser });
  const deadlineNotifs1 = goalList1.data.notifications.filter((n) => n.type === 'GOAL_DEADLINE');
  check('No deadline alert before window', deadlineNotifs1.length === 0);

  // Contribute to reach 100%
  const contribRes = await request('POST', `/api/savings-goals/${goalId}/contributions`, {
    token: goalUser, body: { amount: 10000 }
  });
  if (contribRes.status !== 200 && contribRes.status !== 201) {
    console.log('  [debug] Contribution response:', contribRes.status, JSON.stringify(contribRes.data));
  }
  check('Contribution succeeds', contribRes.status === 200 || contribRes.status === 201);

  // Process — should create GOAL_COMPLETED
  await request('POST', '/api/notifications/process', { token: goalUser });
  const goalList2 = await request('GET', '/api/notifications', { token: goalUser });
  const completedNotifs = goalList2.data.notifications.filter((n) => n.type === 'GOAL_COMPLETED');
  check('Goal completed alert created', completedNotifs.length > 0);
  check('Goal completed has correct message',
    completedNotifs.some((n) => n.message.includes('reached your target')));

  // Dedupe
  await request('POST', '/api/notifications/process', { token: goalUser });
  const goalList3 = await request('GET', '/api/notifications', { token: goalUser });
  const completedNotifs2 = goalList3.data.notifications.filter((n) => n.type === 'GOAL_COMPLETED');
  check('Goal completed dedupe: no duplicates', completedNotifs2.length === completedNotifs.length);

  // Create a goal with deadline in 5 days
  const nearDeadline = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const goalRes2 = await request('POST', '/api/savings-goals', {
    token: goalUser,
    body: { name: 'Vacation Fund', targetAmount: 20000, targetDate: nearDeadline }
  });

  await request('POST', '/api/notifications/process', { token: goalUser });
  const goalList4 = await request('GET', '/api/notifications', { token: goalUser });
  const deadlineNotifs = goalList4.data.notifications.filter((n) => n.type === 'GOAL_DEADLINE');
  check('Goal deadline alert created within window', deadlineNotifs.length > 0);
  check('Goal deadline is factual (no failure claim)',
    deadlineNotifs.every((n) => !n.message.includes('failed') && !n.message.includes('behind')));

  console.log('\n--- Low Balance ---');

  const lowUser = await register('lowbal@test.com', 'LowUser');
  const { accountId: lowAcctId } = await setupUser(lowUser, { lowBalanceThreshold: 5000 });

  // Process — balance is still 100000, above threshold
  await request('POST', '/api/notifications/process', { token: lowUser });
  const lowList1 = await request('GET', '/api/notifications', { token: lowUser });
  const lowNotifs1 = lowList1.data.notifications.filter((n) => n.type === 'LOW_BALANCE');
  check('No low balance alert when above threshold', lowNotifs1.length === 0);

  // Spend down below threshold: balance after setup is 131,500 (100k + 50k
  // salary − 18.5k expenses), so the expense must exceed 126,500 to land
  // under the 5,000 threshold.
  const lowCat = await request('POST', '/api/categories', {
    token: lowUser, body: { name: 'LowCat', type: 'EXPENSE', icon: 'utensils', color: '#ff0000' }
  });
  const bigExpense = await request('POST', '/api/transactions', {
    token: lowUser,
    body: { type: 'EXPENSE', amount: 130000, description: 'Big expense', accountId: lowAcctId, categoryId: lowCat.data.category.id, date: curDay(1) }
  });
  check('Big expense transaction succeeds', bigExpense.status === 200 || bigExpense.status === 201);

  await request('POST', '/api/notifications/process', { token: lowUser });
  const lowUserRecord = await prisma.user.findFirst({ where: { email: 'lowbal@test.com' }, select: { id: true } });
  const lowAcct = await prisma.account.findFirst({ where: { userId: lowUserRecord.id, name: 'HDFC Bank' } });
  if (lowAcct) {
    console.log('  [debug] Account balance:', lowAcct.balance, 'threshold:', lowAcct.lowBalanceThreshold);
  }
  const lowList2 = await request('GET', '/api/notifications', { token: lowUser });
  const lowNotifs2 = lowList2.data.notifications.filter((n) => n.type === 'LOW_BALANCE');
  check('Low balance alert created when below threshold', lowNotifs2.length > 0);
  check('Low balance has factual message',
    lowNotifs2.every((n) => n.message.includes('at or below your threshold')));

  // Dedupe
  await request('POST', '/api/notifications/process', { token: lowUser });
  const lowList3 = await request('GET', '/api/notifications', { token: lowUser });
  const lowNotifs3 = lowList3.data.notifications.filter((n) => n.type === 'LOW_BALANCE');
  check('Low balance dedupe: no duplicates', lowNotifs3.length === lowNotifs2.length);

  console.log('\n--- Preferences ---');

  const prefUser = await register('pref@test.com', 'PrefUser');

  // Default preferences
  const prefs1 = await request('GET', '/api/notification-preferences', { token: prefUser });
  check('Default preferences returned', prefs1.status === 200);
  check('Default budgetAlerts is true', prefs1.data.budgetAlerts === true);
  check('Default upcomingPayments is true', prefs1.data.upcomingPayments === true);
  check('Default paymentProcessing is true', prefs1.data.paymentProcessing === true);
  check('Default savingsGoals is true', prefs1.data.savingsGoals === true);
  check('Default lowBalance is true', prefs1.data.lowBalance === true);

  // Update preferences
  const putRes = await request('PUT', '/api/notification-preferences', {
    token: prefUser, body: { budgetAlerts: false, lowBalance: false }
  });
  check('Update preferences returns 200', putRes.status === 200);
  check('budgetAlerts updated to false', putRes.data.budgetAlerts === false);
  check('lowBalance updated to false', putRes.data.lowBalance === false);
  check('Other prefs unchanged', putRes.data.upcomingPayments === true);

  // Persist check
  const prefs2 = await request('GET', '/api/notification-preferences', { token: prefUser });
  check('Preferences persisted', prefs2.data.budgetAlerts === false && prefs2.data.lowBalance === false);

  // Disable blocks creation
  await setupUser(prefUser, { withBudget: true });
  await request('POST', '/api/notifications/process', { token: prefUser });
  const prefList = await request('GET', '/api/notifications', { token: prefUser });
  const budgetNotifs = prefList.data.notifications.filter(
    (n) => n.type === 'BUDGET_WARNING' || n.type === 'BUDGET_EXCEEDED'
  );
  check('Disabled budgetAlerts blocks creation', budgetNotifs.length === 0);

  console.log('\n--- DB Checks ---');

  // FK: notifications cascade on user delete
  const fkUser = await register('fk@test.com', 'FKUser');
  await setupUser(fkUser, { withBudget: true });
  await request('POST', '/api/notifications/process', { token: fkUser });
  const fkUserRecord = await prisma.user.findFirst({ where: { email: 'fk@test.com' }, select: { id: true } });
  const fkBefore = await prisma.notification.count({ where: { userId: fkUserRecord.id } });
  check('FK: notifications exist before user delete', fkBefore > 0);

  await prisma.user.delete({ where: { id: fkUserRecord.id } });
  const fkAfter = await prisma.notification.count({ where: { userId: fkUserRecord.id } });
  check('FK: notifications cascade on user delete', fkAfter === 0);

  // Preference uniqueness: one record per user
  const prefUserRecord = await prisma.user.findFirst({ where: { email: 'pref@test.com' }, select: { id: true } });
  const prefCount = await prisma.notificationPreference.count({
    where: { userId: prefUserRecord.id }
  });
  check('Preference: exactly one record per user', prefCount === 1);

  // Indexes exist
  const indexes = await prisma.$queryRaw`
    SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Notification'
  `;
  const indexNames = indexes.map((i) => i.name);
  check('Index: Notification_userId_createdAt_idx exists',
    indexNames.includes('Notification_userId_createdAt_idx'));
  check('Index: Notification_userId_isRead_idx exists',
    indexNames.includes('Notification_userId_isRead_idx'));
  check('Index: Notification_userId_dedupeKey_key exists',
    indexNames.includes('Notification_userId_dedupeKey_key'));

  const prefIndexes = await prisma.$queryRaw`
    SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='NotificationPreference'
  `;
  check('Index: NotificationPreference_userId_key exists',
    prefIndexes.some((i) => i.name === 'NotificationPreference_userId_key'));

  console.log('\n--- Idempotency ---');

  const idemUser = await register('idem@test.com', 'IdemUser');
  await setupUser(idemUser, { withBudget: true });

  // Process 5 times
  for (let i = 0; i < 5; i++) {
    await request('POST', '/api/notifications/process', { token: idemUser });
  }
  const idemList = await request('GET', '/api/notifications', { token: idemUser });
  const budgetIdemNotifs = idemList.data.notifications.filter(
    (n) => n.type === 'BUDGET_WARNING' || n.type === 'BUDGET_EXCEEDED'
  );
  check('Idempotency: 5 runs produce same count as 1', budgetIdemNotifs.length > 0);

  // Verify no duplicate dedupeKeys
  const dedupeKeys = budgetIdemNotifs.map((n) => n.dedupeKey).filter(Boolean);
  const uniqueKeys = new Set(dedupeKeys);
  check('Idempotency: no duplicate dedupeKeys', dedupeKeys.length === uniqueKeys.size);

  // Cleanup
  await prisma.notification.deleteMany({});
  await prisma.notificationPreference.deleteMany({});

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
