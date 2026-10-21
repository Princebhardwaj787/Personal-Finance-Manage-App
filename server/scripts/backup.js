/**
 * DATABASE BACKUP UTILITY (Phase 1 §7)
 * ====================================
 * Creates a verified, restorable backup of the SQLite database.
 *
 * Guarantees:
 *   - The backup is a CONSISTENT snapshot. We use SQLite's `VACUUM INTO`,
 *     which produces a fresh copy while the database is live (a plain file
 *     copy of a live SQLite file can be torn).
 *   - The backup is VALIDATED before it is reported as successful:
 *       1. `PRAGMA integrity_check` must return "ok".
 *       2. Row counts of every table must match the source database.
 *   - The script EXITS NON-ZERO when validation fails, so a scheduled job
 *     or a CI step can never silently record a broken backup.
 *
 * Usage:
 *   npm run db:backup                     # backup the configured DATABASE_URL
 *   npm run db:backup -- --out ./backups  # choose the output directory
 *   npm run db:backup -- --file ./backups/finance-2026-10-21.db
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/** Every table whose row count is compared between source and backup. */
const TABLES = [
  'User',
  'Account',
  'Category',
  'Transaction',
  'Transfer',
  'Budget',
  'SavingsGoal',
  'SavingsContribution',
  'RecurringExpense',
  'RecurringOccurrence',
  'ReportHistory',
  'Notification',
  'NotificationPreference',
  'AuditEvent'
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = { out: null, file: null };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out' && args[i + 1]) {
      result.out = args[i + 1];
      i += 1;
    } else if (args[i] === '--file' && args[i + 1]) {
      result.file = args[i + 1];
      i += 1;
    }
  }
  return result;
};

/** Resolve the on-disk path of the configured SQLite database. */
const resolveDatabasePath = () => {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  const raw = url.replace(/^file:/, '');

  // Prisma resolves relative paths against the schema directory.
  const candidates = [
    path.resolve(process.cwd(), raw),
    path.resolve(process.cwd(), 'prisma', raw),
    path.resolve(process.cwd(), 'server', 'prisma', raw)
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not locate the SQLite database file for DATABASE_URL="${url}". ` +
      `Looked in: ${candidates.join(', ')}`
    );
  }
  return found;
};

const countRows = async (client, table) => {
  const rows = await client.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${table}"`);
  return Number(rows[0].c);
};

const main = async () => {
  const args = parseArgs();
  const sourcePath = resolveDatabasePath();
  const sourceDir = path.dirname(sourcePath);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = args.out
    ? path.resolve(process.cwd(), args.out)
    : path.join(sourceDir, 'backups');
  const targetPath = args.file
    ? path.resolve(process.cwd(), args.file)
    : path.join(outDir, `finance-backup-${stamp}.db`);

  if (!existsSync(path.dirname(targetPath))) {
    mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  if (existsSync(targetPath)) {
    throw new Error(`Refusing to overwrite an existing backup: ${targetPath}`);
  }

  console.log(`Backing up ${sourcePath}`);
  console.log(`      ->  ${targetPath}`);

  // 1. Consistent snapshot. `VACUUM INTO` writes a fresh, defragmented copy
  //    and is safe while the database is open.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`);

  // 2. Validate the copy.
  const backupClient = new PrismaClient({ datasources: { db: { url: `file:${targetPath}` } } });
  try {
    const integrity = await backupClient.$queryRawUnsafe('PRAGMA integrity_check');
    const integrityResult = String(integrity[0]?.integrity_check ?? '').trim();
    if (integrityResult !== 'ok') {
      throw new Error(`Backup integrity check failed: ${integrityResult}`);
    }

    const mismatches = [];
    for (const table of TABLES) {
      const sourceCount = await countRows(prisma, table);
      const backupCount = await countRows(backupClient, table);
      if (sourceCount !== backupCount) {
        mismatches.push(`${table}: source=${sourceCount} backup=${backupCount}`);
      }
    }

    if (mismatches.length > 0) {
      throw new Error(`Backup row counts do not match the source:\n  ${mismatches.join('\n  ')}`);
    }

    const sizeBytes = statSync(targetPath).size;
    console.log('');
    console.log('Backup validated successfully.');
    console.log(`  integrity_check : ok`);
    console.log(`  tables compared : ${TABLES.length}`);
    console.log(`  size            : ${(sizeBytes / 1024).toFixed(1)} KB`);
    console.log('');
    console.log('Restore with:');
    console.log(`  npm run db:restore -- --file "${targetPath}"`);
  } catch (error) {
    // Never leave a broken backup behind claiming success.
    try {
      if (existsSync(targetPath)) unlinkSync(targetPath);
      console.error('Removed the invalid backup file.');
    } catch {
      // Best effort.
    }
    throw error;
  } finally {
    await backupClient.$disconnect();
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backup failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
