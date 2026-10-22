import { defineConfig } from 'vitest/config';
import { sharedAlias } from './alias.config.js';

export default defineConfig({
  resolve: {
    alias: sharedAlias
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'tests/**/*.test.js'],
    globals: false,
    // The local data layer opens a real SQLite file; give it room.
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        // `node:sqlite` is a Node builtin. Vite would otherwise try to
        // resolve it as a browser module and fail.
        external: [/node:sqlite/]
      }
    }
  }
});
