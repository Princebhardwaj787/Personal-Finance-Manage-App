import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],

    // The test suite uses a single SQLite file (`test.db`) that is recreated
    // by `tests/setup.js` before each test file. Running files in parallel
    // would let one worker delete the database while another is mid-test,
    // producing spurious foreign-key errors and missing rows.
    // File parallelism is therefore disabled; the suite is fast enough.
    fileParallelism: false,

    // Isolate each test file so one file's database state never leaks into another.
    isolate: true,

    // Fail fast on unhandled errors so financial regressions surface immediately.
    stopOnFailure: false,

    // Password hashing (bcrypt, 12 rounds) makes auth-dependent hooks slow.
    hookTimeout: 60000,
    testTimeout: 30000,

    deps: {
      inline: ['@prisma/client']
    }
  }
});
