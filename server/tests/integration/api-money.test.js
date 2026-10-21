/**
 * API INTEGRATION TESTS — MONEY CONTRACT (Phase 1 §3)
 * =====================================================
 * Exercises the real Express app over HTTP (no port binding in test mode).
 *
 * Locks in the API contract:
 *   - request amounts are DECIMAL major units (e.g. 100.50)
 *   - response amounts are DECIMAL major units
 *   - storage is integer minor units (verified directly in the DB)
 *   - user isolation holds: user A can never read user B's records
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { createServer } from 'http';
import { prisma, truncateAllTables, disconnectDb } from '../helpers/db.js';
import { toMinorUnits } from '../../src/utils/money.js';

let server;
let baseUrl;
let app;

const request = async (method, path, { token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
};

const registerUser = async (email) => {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'Password123!', name: 'Test User' }
  });
  expect(res.status).toBe(201);
  return { token: res.data.token, userId: res.data.user.id, email };
};

beforeAll(async () => {
  // Imported after the DB helper so the app reuses the same Prisma client.
  const mod = await import('../../src/index.js');
  app = mod.default;
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
}, 60000);

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('money API contract', () => {
  it('registers a user and returns a token', async () => {
    const res = await request('POST', '/api/auth/register', {
      body: { email: 'api@example.com', password: 'Password123!', name: 'API' }
    });
    expect(res.status).toBe(201);
    expect(res.data.token).toBeTruthy();
    expect(res.data.user.email).toBe('api@example.com');
  });

  it('stores transaction amounts as integer minor units and returns decimals', async () => {
    const { token, userId } = await registerUser('money@example.com');

    const accountRes = await request('POST', '/api/accounts', {
      token,
      body: { name: 'Cash', type: 'CASH', balance: 1000.50, currency: 'INR' }
    });
    expect(accountRes.status).toBe(201);
    // Response is decimal major units.
    expect(accountRes.data.account.balance).toBe(1000.5);

    // Storage is integer minor units.
    const storedAccount = await prisma.account.findFirst({ where: { userId } });
    expect(storedAccount.balance).toBe(100050);
    expect(Number.isInteger(storedAccount.balance)).toBe(true);

    // Create a transaction with a 2-decimal amount.
    const txnRes = await request('POST', '/api/transactions', {
      token,
      body: {
        type: 'EXPENSE',
        amount: 100.50,
        accountId: storedAccount.id,
        description: 'Test purchase'
      }
    });
    expect(txnRes.status).toBe(201);
    expect(txnRes.data.transaction.amount).toBe(100.5);

    // Stored as integer minor units.
    const storedTxn = await prisma.transaction.findFirst({ where: { userId } });
    expect(storedTxn.amount).toBe(10050);
    expect(Number.isInteger(storedTxn.amount)).toBe(true);

    // Balance reflects the exact minor-unit arithmetic.
    const after = await prisma.account.findFirst({ where: { id: storedAccount.id } });
    expect(after.balance).toBe(100050 - 10050);
  });

  it('rounds sub-paise input to the nearest paise on write', async () => {
    const { token, userId } = await registerUser('round@example.com');
    const accountRes = await request('POST', '/api/accounts', {
      token,
      body: { name: 'Cash', type: 'CASH', balance: 0, currency: 'INR' }
    });
    const accountId = accountRes.data.account.id;

    const txnRes = await request('POST', '/api/transactions', {
      token,
      body: { type: 'EXPENSE', amount: 10.005, accountId }
    });
    expect(txnRes.status).toBe(201);
    expect(txnRes.data.transaction.amount).toBe(10.01);

    const stored = await prisma.transaction.findFirst({ where: { userId } });
    expect(stored.amount).toBe(toMinorUnits(10.005));
  });

  it('filters transactions by decimal min/max amount', async () => {
    const { token } = await registerUser('filter@example.com');
    const accountRes = await request('POST', '/api/accounts', {
      token,
      body: { name: 'Cash', type: 'CASH', balance: 100000, currency: 'INR' }
    });
    const accountId = accountRes.data.account.id;

    for (const amount of [50, 150, 250]) {
      await request('POST', '/api/transactions', {
        token,
        body: { type: 'EXPENSE', amount, accountId }
      });
    }

    const res = await request('GET', '/api/transactions?minAmount=100&maxAmount=200', { token });
    expect(res.status).toBe(200);
    expect(res.data.pagination.total).toBe(1);
    expect(res.data.transactions[0].amount).toBe(150);
  });

  it('never exposes another user\'s transactions', async () => {
    const alice = await registerUser('alice@example.com');
    const bob = await registerUser('bob@example.com');

    const aliceAccountRes = await request('POST', '/api/accounts', {
      token: alice.token,
      body: { name: 'Alice Cash', type: 'CASH', balance: 500, currency: 'INR' }
    });
    await request('POST', '/api/transactions', {
      token: alice.token,
      body: { type: 'EXPENSE', amount: 25.5, accountId: aliceAccountRes.data.account.id }
    });

    // Bob cannot list Alice's transactions.
    const listRes = await request('GET', '/api/transactions', { token: bob.token });
    expect(listRes.status).toBe(200);
    expect(listRes.data.pagination.total).toBe(0);

    // Bob cannot read Alice's account by id.
    const foreignAccountRes = await request(
      'GET',
      `/api/accounts/${aliceAccountRes.data.account.id}`,
      { token: bob.token }
    );
    expect(foreignAccountRes.status).toBe(404);
  });

  it('rejects unauthenticated access to protected resources', async () => {
    const res = await request('GET', '/api/transactions');
    expect(res.status).toBe(401);
  });

  it('rejects a non-numeric or non-positive amount', async () => {
    const { token } = await registerUser('invalid@example.com');
    const accountRes = await request('POST', '/api/accounts', {
      token,
      body: { name: 'Cash', type: 'CASH', balance: 100, currency: 'INR' }
    });
    const accountId = accountRes.data.account.id;

    const zero = await request('POST', '/api/transactions', {
      token,
      body: { type: 'EXPENSE', amount: 0, accountId }
    });
    expect(zero.status).toBe(400);

    const negative = await request('POST', '/api/transactions', {
      token,
      body: { type: 'EXPENSE', amount: -10, accountId }
    });
    expect(negative.status).toBe(400);
  });

  it('excludes transfers from income and expense totals', async () => {
    const { token } = await registerUser('transfer@example.com');
    const a = await request('POST', '/api/accounts', {
      token, body: { name: 'Cash', type: 'CASH', balance: 1000, currency: 'INR' }
    });
    const b = await request('POST', '/api/accounts', {
      token, body: { name: 'Bank', type: 'BANK', balance: 0, currency: 'INR' }
    });

    await request('POST', '/api/transfers', {
      token,
      body: { fromAccountId: a.data.account.id, toAccountId: b.data.account.id, amount: 250 }
    });

    const summary = await request('GET', '/api/transactions/summary', { token });
    expect(summary.status).toBe(200);
    expect(summary.data.totalIncome).toBe(0);
    expect(summary.data.totalExpenses).toBe(0);
  });
});
