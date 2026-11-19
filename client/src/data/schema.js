/**
 * LOCAL DATABASE SCHEMA (Android conversion — Phase C)
 * ====================================================
 * Versioned DDL for the on-device SQLite database.
 *
 * The schema MIRRORS `server/prisma/schema.prisma` table for table and
 * column for column, so the same repository SQL and the same service logic
 * produce the same results on the device and on the server.
 *
 * A parity test (`client/src/data/schema.parity.test.js`) parses the Prisma
 * schema and asserts that every table and column here matches it. If the two
 * ever drift, the test fails.
 *
 * Money is stored as INTEGER minor units (paise) — identical to the server.
 *
 * `AppSetting` is the one LOCAL-ONLY table: it holds device-local app
 * preferences (app lock, last backup date) that have no server equivalent.
 */

/** Bumped whenever a migration is added. */
export const SCHEMA_VERSION = 2;

/** The single local user that owns every record on the device. */
export const LOCAL_USER_ID = 'local-user';
export const LOCAL_USER_EMAIL = 'local@device';

/**
 * Migrations are applied in order and recorded in `_LocalMigrations`, so an
 * existing installation is upgraded in place and never re-created.
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db) => {
      const statements = [
        // ------------------------------------------------------------------
        // User
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "User" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "email" TEXT NOT NULL,
            "passwordHash" TEXT NOT NULL,
            "name" TEXT,
            "avatar" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,

        // ------------------------------------------------------------------
        // Category
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "Category" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "icon" TEXT,
            "color" TEXT,
            "userId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_userId_type_key" ON "Category"("name", "userId", "type")`,
        `CREATE INDEX IF NOT EXISTS "Category_userId_type_idx" ON "Category"("userId", "type")`,

        // ------------------------------------------------------------------
        // Account
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "Account" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "balance" INTEGER NOT NULL DEFAULT 0,
            "currency" TEXT NOT NULL DEFAULT 'INR',
            "icon" TEXT,
            "color" TEXT,
            "isDefault" BOOLEAN NOT NULL DEFAULT false,
            "lowBalanceThreshold" INTEGER,
            "userId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId")`,

        // ------------------------------------------------------------------
        // Transaction
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "Transaction" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "type" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "description" TEXT,
            "notes" TEXT,
            "reference" TEXT,
            "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "userId" TEXT NOT NULL,
            "accountId" TEXT NOT NULL,
            "categoryId" TEXT,
            "recurringExpenseId" TEXT,
            "transferAccountId" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "Transaction_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "Transaction_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "Transaction_userId_date_idx" ON "Transaction"("userId", "date")`,
        `CREATE INDEX IF NOT EXISTS "Transaction_userId_accountId_idx" ON "Transaction"("userId", "accountId")`,
        `CREATE INDEX IF NOT EXISTS "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId")`,
        `CREATE INDEX IF NOT EXISTS "Transaction_userId_type_date_idx" ON "Transaction"("userId", "type", "date")`,
        `CREATE INDEX IF NOT EXISTS "Transaction_userId_amount_idx" ON "Transaction"("userId", "amount")`,
        `CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "Transaction_recurringExpenseId_idx" ON "Transaction"("recurringExpenseId")`,

        // ------------------------------------------------------------------
        // Budget
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "Budget" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "spent" INTEGER NOT NULL DEFAULT 0,
            "month" INTEGER NOT NULL,
            "year" INTEGER NOT NULL,
            "userId" TEXT NOT NULL,
            "categoryId" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "Budget_userId_categoryId_month_year_key" ON "Budget"("userId", "categoryId", "month", "year")`,
        `CREATE INDEX IF NOT EXISTS "Budget_userId_month_year_idx" ON "Budget"("userId", "month", "year")`,

        // ------------------------------------------------------------------
        // SavingsGoal
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "SavingsGoal" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "targetAmount" INTEGER NOT NULL,
            "currentAmount" INTEGER NOT NULL DEFAULT 0,
            "targetDate" DATETIME NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'ACTIVE',
            "userId" TEXT NOT NULL,
            "accountId" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "SavingsGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "SavingsGoal_userId_idx" ON "SavingsGoal"("userId")`,
        `CREATE INDEX IF NOT EXISTS "SavingsGoal_userId_status_idx" ON "SavingsGoal"("userId", "status")`,

        // ------------------------------------------------------------------
        // SavingsContribution
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "SavingsContribution" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "goalId" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "note" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "SavingsContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "SavingsContribution_goalId_date_idx" ON "SavingsContribution"("goalId", "date")`,

        // ------------------------------------------------------------------
        // RecurringExpense
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "RecurringExpense" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "frequency" TEXT NOT NULL,
            "nextDueDate" DATETIME NOT NULL,
            "description" TEXT,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "userId" TEXT NOT NULL,
            "accountId" TEXT NOT NULL,
            "categoryId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "RecurringExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "RecurringExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "RecurringExpense_userId_idx" ON "RecurringExpense"("userId")`,
        `CREATE INDEX IF NOT EXISTS "RecurringExpense_userId_isActive_nextDueDate_idx" ON "RecurringExpense"("userId", "isActive", "nextDueDate")`,

        // ------------------------------------------------------------------
        // Transfer
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "Transfer" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "amount" INTEGER NOT NULL,
            "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "description" TEXT,
            "userId" TEXT NOT NULL,
            "fromAccountId" TEXT NOT NULL,
            "toAccountId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "Transfer_userId_date_idx" ON "Transfer"("userId", "date")`,
        `CREATE INDEX IF NOT EXISTS "Transfer_userId_fromAccountId_idx" ON "Transfer"("userId", "fromAccountId")`,
        `CREATE INDEX IF NOT EXISTS "Transfer_userId_toAccountId_idx" ON "Transfer"("userId", "toAccountId")`,

        // ------------------------------------------------------------------
        // RecurringOccurrence
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "RecurringOccurrence" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "recurringExpenseId" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "dueDate" DATETIME NOT NULL,
            "status" TEXT NOT NULL,
            "transactionId" TEXT,
            "failureReason" TEXT,
            "attemptCount" INTEGER NOT NULL DEFAULT 1,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "RecurringOccurrence_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "RecurringOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "RecurringOccurrence_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "RecurringOccurrence_transactionId_key" ON "RecurringOccurrence"("transactionId")`,
        `CREATE INDEX IF NOT EXISTS "RecurringOccurrence_userId_status_idx" ON "RecurringOccurrence"("userId", "status")`,
        `CREATE INDEX IF NOT EXISTS "RecurringOccurrence_userId_dueDate_idx" ON "RecurringOccurrence"("userId", "dueDate")`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "RecurringOccurrence_recurringExpenseId_dueDate_key" ON "RecurringOccurrence"("recurringExpenseId", "dueDate")`,

        // ------------------------------------------------------------------
        // ReportHistory
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "ReportHistory" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "format" TEXT NOT NULL DEFAULT 'json',
            "startDate" TEXT NOT NULL,
            "endDate" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "ReportHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "ReportHistory_userId_createdAt_idx" ON "ReportHistory"("userId", "createdAt")`,

        // ------------------------------------------------------------------
        // Notification
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "Notification" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "priority" TEXT NOT NULL DEFAULT 'INFO',
            "title" TEXT NOT NULL,
            "message" TEXT NOT NULL,
            "isRead" BOOLEAN NOT NULL DEFAULT false,
            "readAt" DATETIME,
            "metadata" TEXT,
            "dedupeKey" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead")`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey")`,

        // ------------------------------------------------------------------
        // NotificationPreference
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "NotificationPreference" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT NOT NULL,
            "budgetAlerts" BOOLEAN NOT NULL DEFAULT true,
            "upcomingPayments" BOOLEAN NOT NULL DEFAULT true,
            "paymentProcessing" BOOLEAN NOT NULL DEFAULT true,
            "savingsGoals" BOOLEAN NOT NULL DEFAULT true,
            "lowBalance" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId")`,

        // ------------------------------------------------------------------
        // AuditEvent
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "AuditEvent" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" TEXT,
            "action" TEXT NOT NULL,
            "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
            "source" TEXT NOT NULL DEFAULT 'API',
            "route" TEXT,
            "ip" TEXT,
            "metadata" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt")`,

        // ------------------------------------------------------------------
        // AppSetting — LOCAL ONLY (device preferences, no server equivalent)
        // ------------------------------------------------------------------
        `CREATE TABLE IF NOT EXISTS "AppSetting" (
            "key" TEXT NOT NULL PRIMARY KEY,
            "value" TEXT,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      ];

      for (const statement of statements) {
        await db.execute(statement);
      }
    }
  },
  {
    version: 2,
    name: 'add_debt_investment_document_and_transaction_fields',
    up: async (db) => {
      const statements = [];

      statements.push(`
        CREATE TABLE IF NOT EXISTS "Debt" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "type" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "principalAmount" INTEGER NOT NULL,
            "outstandingAmount" INTEGER NOT NULL,
            "interestRate" REAL,
            "nextDueDate" DATETIME,
            "status" TEXT NOT NULL DEFAULT 'ACTIVE',
            "accountId" TEXT,
            "userId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "Debt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      statements.push(`CREATE INDEX IF NOT EXISTS "Debt_userId_type_status_idx" ON "Debt"("userId", "type", "status")`);
      statements.push(`CREATE INDEX IF NOT EXISTS "Debt_userId_nextDueDate_idx" ON "Debt"("userId", "nextDueDate")`);

      statements.push(`
        CREATE TABLE IF NOT EXISTS "DebtPayment" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "type" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "principalPortion" INTEGER NOT NULL,
            "interestPortion" INTEGER NOT NULL,
            "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "note" TEXT,
            "debtId" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "DebtPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      statements.push(`CREATE INDEX IF NOT EXISTS "DebtPayment_debtId_date_idx" ON "DebtPayment"("debtId", "date")`);
      statements.push(`CREATE INDEX IF NOT EXISTS "DebtPayment_userId_date_idx" ON "DebtPayment"("userId", "date")`);

      statements.push(`
        CREATE TABLE IF NOT EXISTS "Investment" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "type" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "investmentAmount" INTEGER NOT NULL DEFAULT 0,
            "currentValue" INTEGER NOT NULL DEFAULT 0,
            "units" REAL,
            "purchaseDate" DATETIME NOT NULL,
            "currentValuationDate" DATETIME,
            "accountId" TEXT,
            "userId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL,
            CONSTRAINT "Investment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      statements.push(`CREATE INDEX IF NOT EXISTS "Investment_userId_type_idx" ON "Investment"("userId", "type")`);
      statements.push(`CREATE INDEX IF NOT EXISTS "Investment_userId_purchaseDate_idx" ON "Investment"("userId", "purchaseDate")`);

      statements.push(`
        CREATE TABLE IF NOT EXISTS "InvestmentTransaction" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "type" TEXT NOT NULL,
            "amount" INTEGER NOT NULL,
            "units" REAL,
            "pricePerUnit" INTEGER,
            "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "note" TEXT,
            "investmentId" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "InvestmentTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "InvestmentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      statements.push(`CREATE INDEX IF NOT EXISTS "InvestmentTransaction_investmentId_date_idx" ON "InvestmentTransaction"("investmentId", "date")`);

      statements.push(`
        CREATE TABLE IF NOT EXISTS "Document" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "transactionId" TEXT,
            "fileName" TEXT NOT NULL,
            "filePath" TEXT NOT NULL,
            "fileType" TEXT NOT NULL,
            "fileSize" INTEGER NOT NULL,
            "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "userId" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Document_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      statements.push(`CREATE INDEX IF NOT EXISTS "Document_userId_uploadedAt_idx" ON "Document"("userId", "uploadedAt")`);
      statements.push(`CREATE INDEX IF NOT EXISTS "Document_transactionId_idx" ON "Document"("transactionId")`);

      statements.push(`ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" TEXT`);
      statements.push(`ALTER TABLE "Transaction" ADD COLUMN "merchant" TEXT`);
      statements.push(`ALTER TABLE "Transaction" ADD COLUMN "tags" TEXT`);
      statements.push(`ALTER TABLE "Transaction" ADD COLUMN "subcategory" TEXT`);
      statements.push(`ALTER TABLE "Transaction" ADD COLUMN "attachmentUrl" TEXT`);
      statements.push(`ALTER TABLE "Transaction" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT 0`);

      statements.push(`ALTER TABLE "Budget" ADD COLUMN "periodType" TEXT NOT NULL DEFAULT 'MONTHLY'`);
      statements.push(`ALTER TABLE "Budget" ADD COLUMN "rollover" BOOLEAN NOT NULL DEFAULT 0`);
      statements.push(`ALTER TABLE "Budget" ADD COLUMN "startDate" DATETIME`);
      statements.push(`ALTER TABLE "Budget" ADD COLUMN "endDate" DATETIME`);

      for (const statement of statements) {
        await db.execute(statement);
      }
    }
  }
];

/**
 * Apply every pending migration.
 *
 * The applied versions are recorded in `_LocalMigrations`, so re-running this
 * on an existing device database is a no-op.
 *
 * The schema is ~50 DDL statements. On the device each native call has real
 * latency, so the statements are sent as ONE batch when the adapter supports
 * it (the Capacitor SQLite plugin does); otherwise they run one by one.
 */
export const migrate = async (db) => {
  await db.execute(`CREATE TABLE IF NOT EXISTS "_LocalMigrations" (
    "version" INTEGER NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await db.select('SELECT version FROM "_LocalMigrations"');
  const appliedVersions = new Set(applied.map((row) => Number(row.version)));

  const pending = MIGRATIONS.filter((migration) => !appliedVersions.has(migration.version));

  for (const migration of pending) {
    await db.transaction(async (tx) => {
      // Collect the statements this migration needs. `up` receives a small
      // collector so a migration can describe its DDL without running it.
      const statements = [];
      const collector = {
        execute: async (sql) => {
          statements.push(sql);
        }
      };

      await migration.up(collector);

      if (tx.executeBatch) {
        await tx.executeBatch(statements);
      } else {
        for (const statement of statements) {
          await tx.execute(statement);
        }
      }

      await tx.execute(
        'INSERT INTO "_LocalMigrations" (version, name) VALUES (?, ?)',
        [migration.version, migration.name]
      );
    });
  }

  return { applied: pending.map((m) => m.version), version: SCHEMA_VERSION };
};

/**
 * Ensure the single local user exists and the default categories are seeded.
 * Idempotent — safe to call on every start-up.
 */
export const ensureLocalUser = async (db, { name = 'Me' } = {}) => {
  const existing = await db.select('SELECT id, email FROM "User" WHERE id = ?', [LOCAL_USER_ID]);
  if (existing.length > 0) {
    return { id: LOCAL_USER_ID, created: false };
  }

  await db.execute(
    'INSERT INTO "User" (id, email, "passwordHash", name, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
    [LOCAL_USER_ID, LOCAL_USER_EMAIL, 'local-only', name, new Date().toISOString(), new Date().toISOString()]
  );

  return { id: LOCAL_USER_ID, created: true };
};

/**
 * Seed the default income/expense categories for the local user.
 * Mirrors the server's `DEFAULT_CATEGORIES` so both platforms start alike.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'INCOME', icon: '💰', color: '#22c55e' },
  { name: 'Freelance', type: 'INCOME', icon: '💻', color: '#16a34a' },
  { name: 'Investments', type: 'INCOME', icon: '📈', color: '#15803d' },
  { name: 'Gifts', type: 'INCOME', icon: '🎁', color: '#166534' },
  { name: 'Other Income', type: 'INCOME', icon: '➕', color: '#14532d' },
  { name: 'Food & Dining', type: 'EXPENSE', icon: '🍔', color: '#ef4444' },
  { name: 'Shopping', type: 'EXPENSE', icon: '🛍️', color: '#dc2626' },
  { name: 'Transport', type: 'EXPENSE', icon: '🚌', color: '#b91c1c' },
  { name: 'Bills & Utilities', type: 'EXPENSE', icon: '💡', color: '#991b1b' },
  { name: 'Entertainment', type: 'EXPENSE', icon: '🎮', color: '#7f1d1d' },
  { name: 'Health & Medical', type: 'EXPENSE', icon: '🏥', color: '#f97316' },
  { name: 'Education', type: 'EXPENSE', icon: '📚', color: '#ea580c' },
  { name: 'Travel', type: 'EXPENSE', icon: '✈️', color: '#c2410c' },
  { name: 'Personal Care', type: 'EXPENSE', icon: '💇', color: '#9a3412' },
  { name: 'Other Expenses', type: 'EXPENSE', icon: '📦', color: '#7c2d12' }
];

export const seedDefaultCategories = async (db, userId = LOCAL_USER_ID) => {
  const existing = await db.select('SELECT COUNT(*) AS c FROM "Category" WHERE userId = ?', [userId]);
  if (Number(existing[0]?.c ?? 0) > 0) return { created: 0 };

  const now = new Date().toISOString();
  for (const category of DEFAULT_CATEGORIES) {
    await db.execute(
      'INSERT INTO "Category" (id, name, type, icon, color, userId, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [makeId(), category.name, category.type, category.icon, category.color, userId, now, now]
    );
  }
  return { created: DEFAULT_CATEGORIES.length };
};

/**
 * A cuid-like unique id generator.
 *
 * Format: <timestamp base36><counter base36><random base36> — the same shape
 * Prisma's `cuid()` produces, so ids look identical on both platforms and
 * sort roughly by creation time.
 */
let idCounter = Math.floor(Math.random() * 36 * 36 * 36);
export const makeId = () => {
  idCounter = (idCounter + 1) % (36 * 36 * 36 * 36);
  const timestamp = Date.now().toString(36);
  const counter = idCounter.toString(36).padStart(4, '0');
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `c${timestamp}${counter}${random}`;
};

/** Apply the schema, create the local user and seed the default categories. */
export const bootstrap = async (db, options = {}) => {
  const migration = await migrate(db);
  const user = await ensureLocalUser(db, options);
  const categories = await seedDefaultCategories(db);
  return { ...migration, user, categories };
};
