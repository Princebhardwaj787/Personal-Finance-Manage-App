/**
 * ROUND-TRIP CHECK: backup -> mutate -> restore -> verify.
 *
 * ⚠️  THIS SCRIPT DELETES DATA. It removes every user from the configured
 *     database in order to prove that a restore really brings the records
 *     back. It therefore REFUSES TO RUN against anything that is not an
 *     obvious throwaway test database.
 *
 *     A previous version of this script had no such guard and was run
 *     against the development database, which emptied it. The data was
 *     recovered from a validated backup, but the guard now makes that class
 *     of mistake impossible.
 *
 * Usage:
 *   DATABASE_URL="file:./prisma/roundtrip-test.db" node scripts/verify-backup-restore.mjs
 *
 * The test database is created, used and left in place for inspection.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import path from 'path';

/* ------------------------------------------------------------------ */
/* SAFETY GUARD — refuse to touch anything that is not a test DB      */
/* ------------------------------------------------------------------ */

const databaseUrl = process.env.DATABASE_URL || '';

/** The database file must look like a throwaway test database. */
const isTestDatabase = (url) => {
  if (!url) return false;
  const file = url.replace(/^file:/, '').split('?')[0];
  const name = path.basename(file).toLowerCase();
  return /(^|[.\-_])test([.\-_]|$)/.test(name) || /test/.test(name);
};

if (!isTestDatabase(databaseUrl)) {
  console.error('');
  console.error('REFUSING TO RUN.');
  console.error(`  DATABASE_URL = "${databaseUrl}"`);
  console.error('  This script DELETES ALL USERS from the configured database.');
  console.error('  It will only run against a database whose file name contains "test".');
  console.error('');
  console.error('  Example:');
  console.error('    DATABASE_URL="file:./prisma/roundtrip-test.db" \\');
  console.error('      node scripts/verify-backup-restore.mjs');
  console.error('');
  process.exit(1);
}

// Work on a dedicated test database so the development database is never
// referenced, even by the backup/restore scripts this test drives.
const TEST_DB = path.resolve('prisma/roundtrip-test.db');
const RELATIVE_TEST_URL = 'file:./roundtrip-test.db';
process.env.DATABASE_URL = RELATIVE_TEST_URL;

// Start from a clean test database with the schema applied.
if (existsSync(TEST_DB)) rmSync(TEST_DB);
mkdirSync(path.dirname(TEST_DB), { recursive: true });

const prisma = new PrismaClient({ datasources: { db: { url: RELATIVE_TEST_URL } } });
const backupDir = path.resolve('prisma/roundtrip-backups');

/** Path to the locally installed Prisma CLI (no `npx`/shell needed). */
const PRISMA_CLI = path.resolve('node_modules/prisma/build/index.js');

const run = (cmd, args, env) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: RELATIVE_TEST_URL, ...env }
  });

try {
  // Apply the schema to the fresh test database.
  run(process.execPath, [PRISMA_CLI, 'migrate', 'deploy']);
  console.log('0. Test database created:', TEST_DB);

  // Seed a little data so the round trip actually proves something.
  const seeded = await prisma.user.create({
    data: { email: 'roundtrip@example.com', passwordHash: 'x', name: 'Round Trip' }
  });
  const account = await prisma.account.create({
    data: { userId: seeded.id, name: 'Roundtrip Account', type: 'CASH', balance: 100000 }
  });
  await prisma.transaction.create({
    data: {
      userId: seeded.id,
      accountId: account.id,
      type: 'EXPENSE',
      amount: 2550, // minor units
      description: 'Roundtrip expense'
    }
  });
  console.log('0b. Seeded 1 user, 1 account, 1 transaction into the test database.');

  // 1. Fresh backup
  run(process.execPath, ['scripts/backup.js', '--out', backupDir]);
  const files = readdirSync(backupDir).filter((f) => f.endsWith('.db')).sort();
  const backupFile = path.join(backupDir, files[files.length - 1]);
  console.log('1. Backup created:', backupFile);

  // 2. Mutate: delete every user (cascades to their financial records).
  const before = await prisma.user.count();
  const txBefore = await prisma.transaction.count();
  const balBefore = await prisma.account.findFirst({ select: { balance: true } });
  await prisma.user.deleteMany({});
  const after = await prisma.user.count();
  console.log(
    `2. Mutated. users ${before} -> ${after}, transactions now ${await prisma.transaction.count()} (was ${txBefore})`
  );

  // 3. Restore (the client must release the database before the swap).
  await prisma.$disconnect();
  run(process.execPath, ['scripts/restore.js', '--file', backupFile, '--yes']);
  console.log('3. Restored.');

  // 4. Verify — counts AND the actual monetary values.
  const check = new PrismaClient({ datasources: { db: { url: RELATIVE_TEST_URL } } });
  const restoredUsers = await check.user.count();
  const restoredTx = await check.transaction.count();
  const restoredAcc = await check.account.findFirst({ select: { balance: true } });
  const restoredAmount = await check.transaction.findFirst({ select: { amount: true } });
  console.log(
    `4. Verified. users=${restoredUsers} (expected ${before}), transactions=${restoredTx} (expected ${txBefore})`
  );
  console.log(
    `   balance restored = ${restoredAcc?.balance} (expected ${balBefore?.balance}), ` +
    `transaction amount = ${restoredAmount?.amount} (expected 2550)`
  );

  const ok =
    restoredUsers === before &&
    restoredTx === txBefore &&
    restoredAcc?.balance === balBefore?.balance &&
    restoredAmount?.amount === 2550;

  if (!ok) {
    console.error('ROUND TRIP FAILED');
    process.exitCode = 1;
  } else {
    console.log('ROUND TRIP OK');
  }
  await check.$disconnect();
} finally {
  await prisma.$disconnect();
}
