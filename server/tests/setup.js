/**
 * TEST DATABASE SETUP (Phase 1 §2)
 * =================================
 * Runs before every test file. Forces an isolated SQLite database (`test.db`)
 * so the test suite never touches the configured development database (`dev.db`).
 *
 * Strategy:
 *   1. Set NODE_ENV=test and DATABASE_URL=file:./test.db before any server
 *      module is imported (dotenv only fills unset variables, so this wins).
 *   2. Delete any stale test.db so every file starts from a clean schema.
 *   3. Apply all migrations with `prisma migrate deploy`.
 *
 * Test files should truncate tables in `beforeEach` (see helpers/db.js) so
 * individual tests are independent while the schema is applied once per file.
 */

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';

const testDb = path.resolve('test.db');
if (existsSync(testDb)) {
  try {
    unlinkSync(testDb);
  } catch {
    // File may be locked; ignore — migrate deploy will still reset it.
  }
}

// Also clear any WAL/SHM sidecar files from a previous run.
for (const ext of ['-wal', '-shm', '-journal']) {
  const sidecar = testDb + ext;
  if (existsSync(sidecar)) {
    try {
      unlinkSync(sidecar);
    } catch {
      // Best-effort: a locked sidecar file is not fatal.
    }
  }
}

execSync('npx prisma migrate deploy', {
  stdio: 'pipe',
  env: process.env,
  timeout: 120000
});
