/**
 * SMOKE TEST — verifies the isolated test database infrastructure works.
 * Runs against `test.db`, never touches `dev.db`.
 */

import { describe, it, beforeEach, afterAll, expect } from 'vitest';
import { prisma, truncateAllTables, disconnectDb } from './helpers/db.js';
import { seedFixture } from './helpers/seed.js';

describe('test infrastructure', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  it('seeds a fixture user with accounts and categories in isolation', async () => {
    const { user, accounts, categories } = await seedFixture();

    expect(user.email).toBe('fixture@example.com');
    expect(user.id).toBeDefined();
    expect(accounts).toHaveLength(2);
    expect(categories).toHaveLength(3);

    // Verify the user is isolated to this database: no other users exist.
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
  });

  it('truncates tables between tests (no state leakage)', async () => {
    await seedFixture();
    const count1 = await prisma.user.count();
    expect(count1).toBe(1);

    // beforeEach truncates, so a second test in this file starts clean.
  });
});
