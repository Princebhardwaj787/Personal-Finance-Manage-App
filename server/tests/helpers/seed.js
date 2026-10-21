/**
 * TEST FIXTURES (Phase 1 §2)
 * ==========================
 * Creates a consistent fixture user with accounts and categories so tests
 * focus on the behaviour under test, not on setup boilerplate.
 */

import { prisma } from './db.js';
import { createAccount } from '../../src/services/accountService.js';

export const TEST_USER = {
  email: 'fixture@example.com',
  password: 'Password123!',
  name: 'Fixture User',
};

export const ACCOUNT_DEFAULTS = [
  { name: 'Cash', type: 'CASH', balance: 100000, currency: 'INR', isDefault: true }, // ₹1,000.00
  { name: 'Bank', type: 'BANK', balance: 250000, currency: 'INR', isDefault: false }, // ₹2,500.00
];

export const CATEGORY_DEFAULTS = [
  { name: 'Salary', type: 'INCOME', icon: '💰', color: '#22c55e' },
  { name: 'Food & Dining', type: 'EXPENSE', icon: '🍔', color: '#ef4444' },
  { name: 'Transport', type: 'EXPENSE', icon: '🚌', color: '#b91c1c' },
];

/** Create the fixture user, two accounts, and three categories. Returns ids. */
export async function seedFixture() {
  // Defensive: remove any pre-existing fixture user so repeat runs are clean.
  await prisma.user.deleteMany({ where: { email: TEST_USER.email } });

  const user = await prisma.user.create({
    data: {
      email: TEST_USER.email,
      passwordHash: TEST_USER.password, // tests bypass auth; store as-is
      name: TEST_USER.name,
    },
  });

  const accounts = [];
  for (const acct of ACCOUNT_DEFAULTS) {
    // Use the service so decimal balances are converted to minor units.
    accounts.push(await createAccount(user.id, acct));
  }

  const categories = [];
  for (const cat of CATEGORY_DEFAULTS) {
    categories.push(
      await prisma.category.create({
        data: { ...cat, userId: user.id },
      })
    );
  }

  return { user, accounts, categories };
}
