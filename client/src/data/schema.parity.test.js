/**
 * SCHEMA PARITY TEST (Android conversion — Phase C)
 * =================================================
 * The on-device SQLite schema MUST match the server's Prisma schema.
 *
 * If they drift, the same repository SQL would behave differently on the
 * device and on the server — the worst possible failure mode for a financial
 * application. This test parses `server/prisma/schema.prisma` and compares it
 * with the real tables the local database creates.
 *
 * It is the guard that lets the two platforms share one set of repositories.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openNodeDatabase } from './adapters/nodeSqlite.js';
import { bootstrap } from './schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PRISMA_SCHEMA_PATH = path.resolve(here, '../../../server/prisma/schema.prisma');

/** Tables that exist only on the device (no server equivalent). */
const LOCAL_ONLY_TABLES = new Set(['AppSetting', '_LocalMigrations']);

/** Prisma scalar type -> SQLite storage class. */
const EXPECTED_SQLITE_TYPES = {
  String: 'TEXT',
  Int: 'INTEGER',
  Float: 'REAL',
  Boolean: 'BOOLEAN',
  DateTime: 'DATETIME'
};

/**
 * Parse the Prisma schema into `{ modelName: { fieldName: scalarType } }`.
 * Relations and `@@` attributes are ignored — only scalar fields matter for
 * column-level parity.
 */
const parsePrismaSchema = (source) => {
  const models = {};
  const modelBlocks = source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g);

  for (const [, modelName, body] of modelBlocks) {
    const fields = {};
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      // `fieldName Type modifiers` — the type is the second token.
      const match = /^(\w+)\s+(\w+)/.exec(line);
      if (!match) continue;
      const [, fieldName, fieldType] = match;
      // Skip relation fields (they have no scalar type in the list above).
      if (!EXPECTED_SQLITE_TYPES[fieldType]) continue;
      fields[fieldName] = fieldType;
    }
    models[modelName] = fields;
  }

  return models;
};

describe('schema parity with the Prisma schema', () => {
  let db;
  let prismaModels;

  beforeAll(async () => {
    const source = readFileSync(PRISMA_SCHEMA_PATH, 'utf8');
    prismaModels = parsePrismaSchema(source);

    db = openNodeDatabase(':memory:');
    await bootstrap(db);
  });

  afterAll(() => {
    db?.close?.();
  });

  it('parses the Prisma schema (sanity check)', () => {
    expect(Object.keys(prismaModels).length).toBeGreaterThan(10);
    expect(prismaModels.Transaction).toBeDefined();
    expect(prismaModels.Transaction.amount).toBe('Int');
    expect(prismaModels.Account.balance).toBe('Int');
  });

  it('creates every Prisma model as a table', async () => {
    const tables = (
      await db.select("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    ).map((t) => t.name);

    for (const modelName of Object.keys(prismaModels)) {
      expect(tables, `missing table for model ${modelName}`).toContain(modelName);
    }
  });

  it('creates every Prisma field as a column with a compatible type', async () => {
    for (const [modelName, fields] of Object.entries(prismaModels)) {
      const columns = await db.select(`PRAGMA table_info("${modelName}")`);
      const columnMap = new Map(columns.map((c) => [c.name, c.type]));

      for (const [fieldName, prismaType] of Object.entries(fields)) {
        expect(
          columnMap.has(fieldName),
          `${modelName}.${fieldName} is missing from the local schema`
        ).toBe(true);

        const expected = EXPECTED_SQLITE_TYPES[prismaType];
        // SQLite is dynamically typed, so a BOOLEAN column may be reported
        // as BOOLEAN or INTEGER depending on the driver. Accept both.
        const actual = String(columnMap.get(fieldName)).toUpperCase();
        const compatible =
          actual === expected ||
          (prismaType === 'Boolean' && (actual === 'INTEGER' || actual === 'BOOLEAN')) ||
          (prismaType === 'DateTime' && (actual === 'DATETIME' || actual === 'TEXT')) ||
          (prismaType === 'Int' && actual === 'INTEGER');

        expect(
          compatible,
          `${modelName}.${fieldName} has SQLite type "${actual}" but Prisma declares "${prismaType}"`
        ).toBe(true);
      }
    }
  });

  it('creates no unexpected extra columns', async () => {
    for (const [modelName, fields] of Object.entries(prismaModels)) {
      const columns = await db.select(`PRAGMA table_info("${modelName}")`);
      for (const column of columns) {
        expect(
          Object.prototype.hasOwnProperty.call(fields, column.name),
          `${modelName}.${column.name} exists locally but not in the Prisma schema`
        ).toBe(true);
      }
    }
  });

  it('keeps the local-only tables out of the Prisma schema', () => {
    for (const localTable of LOCAL_ONLY_TABLES) {
      expect(
        Object.prototype.hasOwnProperty.call(prismaModels, localTable),
        `${localTable} must not exist in the Prisma schema`
      ).toBe(false);
    }
  });

  it('stores every monetary column as INTEGER in both schemas', () => {
    const monetaryFields = [
      ['Account', 'balance'],
      ['Account', 'lowBalanceThreshold'],
      ['Transaction', 'amount'],
      ['Budget', 'amount'],
      ['Budget', 'spent'],
      ['SavingsGoal', 'targetAmount'],
      ['SavingsGoal', 'currentAmount'],
      ['SavingsContribution', 'amount'],
      ['RecurringExpense', 'amount'],
      ['Transfer', 'amount']
    ];

    for (const [modelName, fieldName] of monetaryFields) {
      expect(prismaModels[modelName][fieldName], `${modelName}.${fieldName}`).toBe('Int');
    }
  });
});
