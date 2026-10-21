/**
 * DEMO SEED (Phase 1 — fixes the broken `npm run db:seed` script)
 * ================================================================
 * Creates a clearly-labelled DEMO user with demo accounts, categories and
 * sample transactions so a fresh checkout has something to look at.
 *
 * ⚠️  EVERYTHING THIS SCRIPT CREATES IS DEMO DATA.
 *     The e-mail is `demo@example.com` and every record is prefixed "Demo".
 *     Never run this against a database that holds real financial data.
 *
 * Usage:
 *   cd server && npm run db:seed
 *
 * The script is idempotent: running it twice does not duplicate anything.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'DemoPassword123!';

/** Decimal major units -> integer minor units (paise). */
const toMinorUnits = (amount) => Math.round(amount * 100);

const DEMO_CATEGORIES = [
  { name: 'Salary', type: 'INCOME', icon: '💰', color: '#22c55e' },
  { name: 'Freelance', type: 'INCOME', icon: '💻', color: '#16a34a' },
  { name: 'Food & Dining', type: 'EXPENSE', icon: '🍔', color: '#ef4444' },
  { name: 'Transport', type: 'EXPENSE', icon: '🚌', color: '#b91c1c' },
  { name: 'Bills & Utilities', type: 'EXPENSE', icon: '💡', color: '#991b1b' }
];

const DEMO_ACCOUNTS = [
  { name: 'Demo Cash', type: 'CASH', balance: 5000, currency: 'INR', isDefault: true },
  { name: 'Demo Bank', type: 'BANK', balance: 125000, currency: 'INR', isDefault: false }
];

/** A handful of demo transactions spread over the current month. Amounts in rupees. */
const demoTransactions = (accountIds, categoryIds) => {
  const now = new Date();
  const day = (offset) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, now.getUTCDate() - offset)));
    return d;
  };

  return [
    { type: 'INCOME', amount: 50000, description: 'Demo monthly salary', date: day(12), accountId: accountIds[0], categoryId: categoryIds.Salary },
    { type: 'INCOME', amount: 15000, description: 'Demo freelance invoice', date: day(5), accountId: accountIds[0], categoryId: categoryIds.Freelance },
    { type: 'EXPENSE', amount: 1250, description: 'Demo groceries', date: day(9), accountId: accountIds[0], categoryId: categoryIds['Food & Dining'] },
    { type: 'EXPENSE', amount: 480, description: 'Demo bus pass', date: day(4), accountId: accountIds[0], categoryId: categoryIds.Transport },
    { type: 'EXPENSE', amount: 3100, description: 'Demo electricity bill', date: day(2), accountId: accountIds[1], categoryId: categoryIds['Bills & Utilities'] }
  ];
};

async function main() {
  console.log('Seeding DEMO data (safe to delete) ...');

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Demo user ${DEMO_EMAIL} already exists — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.create({
    data: { email: DEMO_EMAIL, passwordHash, name: 'Demo User' }
  });

  const categoryIds = {};
  for (const category of DEMO_CATEGORIES) {
    const created = await prisma.category.create({ data: { ...category, userId: user.id } });
    categoryIds[category.name] = created.id;
  }

  const accountIds = [];
  for (const account of DEMO_ACCOUNTS) {
    const created = await prisma.account.create({
      data: {
        name: account.name,
        type: account.type,
        currency: account.currency,
        isDefault: account.isDefault,
        balance: toMinorUnits(account.balance),
        userId: user.id
      }
    });
    accountIds.push(created.id);
  }

  const rows = demoTransactions(accountIds, categoryIds);

  // Apply each transaction to the account balance exactly like the app does,
  // so the seeded balances reconcile with the seeded transactions.
  for (const row of rows) {
    const amount = toMinorUnits(row.amount);

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          type: row.type,
          amount,
          description: row.description,
          date: row.date,
          accountId: row.accountId,
          categoryId: row.categoryId,
          userId: user.id
        }
      });

      await tx.account.update({
        where: { id: row.accountId },
        data: {
          balance: {
            increment: row.type === 'INCOME' ? amount : -amount
          }
        }
      });
    });
  }

  console.log('Demo data seeded:');
  console.log(`  email    : ${DEMO_EMAIL}`);
  console.log(`  password : ${DEMO_PASSWORD}`);
  console.log('  All records are DEMO data — delete them before real use.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
