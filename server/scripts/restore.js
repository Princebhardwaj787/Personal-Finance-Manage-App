/**
 * DATABASE RESTORE UTILITY (Phase 1 §7)
 * ======================================
 * Restores a backup produced by `scripts/backup.js`.
 *
 * Safety rules:
 *   - The CURRENT database is backed up first (as `<name>.pre-restore.db`) so
 *     a restore can itself be undone.
 *   - The backup file is validated BEFORE it replaces anything:
 *       1. `PRAGMA integrity_check` must return "ok".
 *       2. The schema must contain every table the application expects.
 *   - The restore is refused unless `--yes` is passed, so an accidental
 *     invocation cannot destroy data.
 *
 * Usage:
 *   npm run db:restore -- --file ./backups/finance-backup-2026-10-21.db
 *   npm run db:restore -- --file <path> --yes      # skip the confirmation
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { existsSync, copyFileSync, unlinkSync, renameSync } from 'fs';
import path from 'path';
import readline from 'readline';

const prisma = new PrismaClient();

/** Tables the application requires. A backup missing any of them is rejected. */
const REQUIRED_TABLES = [
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
  const result = { file: null, yes: false };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file' && args[i + 1]) {
      result.file = args[i + 1];
      i += 1;
    } else if (args[i] === '--yes' || args[i] === '-y') {
      result.yes = true;
    }
  }
  return result;
};

const resolveDatabasePath = () => {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  const raw = url.replace(/^file:/, '');
  const candidates = [
    path.resolve(process.cwd(), raw),
    path.resolve(process.cwd(), 'prisma', raw),
    path.resolve(process.cwd(), 'server', 'prisma', raw)
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Could not locate the database file for DATABASE_URL="${url}".`);
  }
  return found;
};

const askConfirmation = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });

const main = async () => {
  const args = parseArgs();

  if (!args.file) {
    throw new Error('Missing --file <path-to-backup>. Usage: npm run db:restore -- --file <backup.db>');
  }

  const backupPath = path.resolve(process.cwd(), args.file);
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  // 1. Validate the backup BEFORE touching the live database.
  const backupClient = new PrismaClient({ datasources: { db: { url: `file:${backupPath}` } } });
  try {
    const integrity = await backupClient.$queryRawUnsafe('PRAGMA integrity_check');
    const integrityResult = String(integrity[0]?.integrity_check ?? '').trim();
    if (integrityResult !== 'ok') {
      throw new Error(`Backup integrity check failed: ${integrityResult}`);
    }

    const tables = await backupClient.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const tableNames = new Set(tables.map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((table) => !tableNames.has(table));
    if (missing.length > 0) {
      throw new Error(
        `Backup is missing required tables: ${missing.join(', ')}. It was not created by this application.`
      );
    }
    console.log('Backup validated: integrity ok, all required tables present.');
  } finally {
    await backupClient.$disconnect();
  }

  // 2. Confirm with the operator.
  if (!args.yes) {
    console.log('');
    console.log(`This will REPLACE the live database with: ${backupPath}`);
    const confirmed = await askConfirmation('Type "yes" to continue: ');
    if (!confirmed) {
      console.log('Restore cancelled. Nothing was changed.');
      return;
    }
  }

  // 3. Preserve the current database so the restore can be undone.
  const livePath = resolveDatabasePath();
  const safetyPath = `${livePath}.pre-restore.db`;
  if (existsSync(safetyPath)) unlinkSync(safetyPath);
  copyFileSync(livePath, safetyPath);
  console.log(`Current database preserved at: ${safetyPath}`);

  // 4. Release every database handle BEFORE swapping the file. On Windows an
  //    open connection locks the file and the rename fails with EPERM.
  //    The server must therefore be stopped before a restore.
  await prisma.$disconnect();

  // 5. Replace the live database with the validated backup.
  const tempPath = `${livePath}.restoring`;
  copyFileSync(backupPath, tempPath);
  try {
    renameSync(tempPath, livePath);
  } catch (error) {
    try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch { /* best effort */ }
    throw new Error(
      `Could not replace ${livePath}: ${error.message}. ` +
      'The database file is locked — stop the API server and any other process ' +
      'that has the database open, then run the restore again.'
    );
  }
  console.log('Restore complete.');
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Restore failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
