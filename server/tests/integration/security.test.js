/**
 * SECURITY TESTS (Phase 1 §4)
 * ============================
 * Verifies the hardening actually works:
 *   - security headers are present on every response
 *   - credential endpoints are rate limited
 *   - audit events are written for logins and money-moving operations
 *   - secrets are redacted from logs
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { createServer } from 'http';
import { prisma, truncateAllTables, disconnectDb } from '../helpers/db.js';
import { redact, redactText } from '../../src/utils/logger.js';

let server;
let baseUrl;

const request = async (method, path, { token, body, headers = {} } = {}) => {
  const requestHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
};

const registerUser = async (email) => {
  const res = await request('POST', '/api/auth/register', {
    body: { email, password: 'Password123!', name: 'Test User' }
  });
  expect(res.status).toBe(201);
  return { token: res.data.token, userId: res.data.user.id, email };
};

beforeAll(async () => {
  const mod = await import('../../src/index.js');
  server = createServer(mod.default);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, 60000);

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('security headers', () => {
  it('sets standard hardening headers on API responses', async () => {
    const res = await request('GET', '/api/health');

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    // The framework must not be advertised.
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('does not leak the framework version', async () => {
    const res = await request('GET', '/api/health');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('rate limiting', () => {
  it('rate limits repeated failed logins from the same (ip, email)', async () => {
    const email = 'bruteforce@example.com';

    let sawLimit = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const res = await request('POST', '/api/auth/login', {
        body: { email, password: 'wrong-password' }
      });
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }

    expect(sawLimit).toBe(true);
  });

  it('does not count successful logins against the limiter budget', async () => {
    const { email } = await registerUser('repeat@example.com');

    // Several successful logins in a row must all succeed.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await request('POST', '/api/auth/login', {
        body: { email, password: 'Password123!' }
      });
      expect(res.status).toBe(200);
    }
  });
});

describe('audit trail', () => {
  it('records a successful login', async () => {
    const { email, userId } = await registerUser('audit-login@example.com');
    await request('POST', '/api/auth/login', {
      body: { email, password: 'Password123!' }
    });

    const events = await prisma.auditEvent.findMany({
      where: { userId, action: 'AUTH_LOGIN_SUCCESS' }
    });
    expect(events.length).toBe(1);
    expect(events[0].outcome).toBe('SUCCESS');
  });

  it('records a failed login without revealing whether the account exists', async () => {
    await request('POST', '/api/auth/login', {
      body: { email: 'ghost@example.com', password: 'whatever' }
    });

    const events = await prisma.auditEvent.findMany({
      where: { action: 'AUTH_LOGIN_FAILURE' }
    });
    expect(events.length).toBe(1);
    expect(events[0].userId).toBeNull();
    expect(events[0].metadata).toContain('unknown_email');
  });

  it('records transaction create, update and delete', async () => {
    const { token, userId } = await registerUser('audit-txn@example.com');
    const accountRes = await request('POST', '/api/accounts', {
      token,
      body: { name: 'Cash', type: 'CASH', balance: 1000, currency: 'INR' }
    });
    const accountId = accountRes.data.account.id;

    const created = await request('POST', '/api/transactions', {
      token,
      body: { type: 'EXPENSE', amount: 25, accountId }
    });
    const txnId = created.data.transaction.id;

    await request('PUT', `/api/transactions/${txnId}`, {
      token,
      body: { type: 'EXPENSE', amount: 30, accountId }
    });
    await request('DELETE', `/api/transactions/${txnId}`, { token });

    const actions = (
      await prisma.auditEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    ).map((e) => e.action);

    expect(actions).toContain('TRANSACTION_CREATE');
    expect(actions).toContain('TRANSACTION_UPDATE');
    expect(actions).toContain('TRANSACTION_DELETE');
  });

  it('records transfers', async () => {
    const { token, userId } = await registerUser('audit-transfer@example.com');
    const a = await request('POST', '/api/accounts', {
      token, body: { name: 'Cash', type: 'CASH', balance: 1000, currency: 'INR' }
    });
    const b = await request('POST', '/api/accounts', {
      token, body: { name: 'Bank', type: 'BANK', balance: 0, currency: 'INR' }
    });

    await request('POST', '/api/transfers', {
      token,
      body: { fromAccountId: a.data.account.id, toAccountId: b.data.account.id, amount: 100 }
    });

    const events = await prisma.auditEvent.findMany({
      where: { userId, action: 'TRANSFER_CREATE' }
    });
    expect(events.length).toBe(1);
  });

  it('never stores secrets in audit metadata', async () => {
    const { token, userId } = await registerUser('audit-secret@example.com');
    const accountRes = await request('POST', '/api/accounts', {
      token,
      body: { name: 'Cash', type: 'CASH', balance: 1000, currency: 'INR' }
    });

    await request('POST', '/api/transactions', {
      token,
      body: {
        type: 'EXPENSE',
        amount: 25,
        accountId: accountRes.data.account.id,
        notes: 'my password is hunter2 and token=abc123'
      }
    });

    const events = await prisma.auditEvent.findMany({ where: { userId } });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('abc123');
  });
});

describe('log redaction', () => {
  it('masks sensitive object keys', () => {
    const redacted = redact({
      email: 'user@example.com',
      password: 'hunter2',
      token: 'abc',
      nested: { passwordHash: 'hash', apiKey: 'key' }
    });

    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.nested.passwordHash).toBe('[REDACTED]');
    expect(redacted.nested.apiKey).toBe('[REDACTED]');
  });

  it('masks bearer tokens, JWTs, emails and secret query params in text', () => {
    expect(redactText('Authorization: Bearer abc.def.ghi')).toContain('[REDACTED]');
    expect(redactText('token=supersecretvalue&x=1')).toContain('[REDACTED]');
    expect(redactText('contact user@example.com')).toBe('contact [EMAIL]');
  });

  it('handles circular structures without throwing', () => {
    const obj = { name: 'x' };
    obj.self = obj;
    expect(() => redact(obj)).not.toThrow();
  });
});
