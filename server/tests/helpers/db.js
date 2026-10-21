/**
 * DATABASE HELPERS FOR TESTS (Phase 1 §2)
 * =======================================
 * Provides access to the application's Prisma client (the same singleton the
 * server uses) plus helpers to truncate all tables between tests so state
 * never leaks.
 *
 * IMPORTANT: we deliberately reuse `src/config/database.js` instead of
 * creating a second PrismaClient. Two clients on the same SQLite file can
 * observe different transaction states, which produced spurious foreign-key
 * violations when a fixture was written through one client and read through
 * the other. One client = one consistent view for the whole test process.
 */

import { prisma } from '../../src/config/database.js';

export { prisma };

/** Every table that can hold user-scoped financial data, in dependency order. */
const TABLES = [
  'RecurringOccurrence',
  'Notification',
  'NotificationPreference',
  'ReportHistory',
  'AuditEvent',
  'SavingsContribution',
  'SavingsGoal',
  'RecurringExpense',
  'Transfer',
  'Transaction',
  'Budget',
  'Category',
  'Account',
  'User',
];

/** Delete every row from every table, resetting SQLite auto-increment counters. */
export async function truncateAllTables() {
  // SQLite: disable FK checks temporarily so we can truncate in any order.
  await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;
  try {
    for (const table of TABLES) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
    // Prisma uses `cuid()` string IDs (no AUTOINCREMENT columns), so
    // sqlite_sequence does not exist — nothing to reset here.
  } finally {
    await prisma.$executeRaw`PRAGMA foreign_keys = ON`;
  }
}

/** Disconnect the Prisma client after the test file finishes. */
export async function disconnectDb() {
  await prisma.$disconnect();
}
