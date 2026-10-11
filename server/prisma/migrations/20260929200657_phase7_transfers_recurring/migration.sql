-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
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
);

-- CreateTable
CREATE TABLE "RecurringOccurrence" (
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
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
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
);
INSERT INTO "new_Transaction" ("accountId", "amount", "categoryId", "createdAt", "date", "description", "id", "transferAccountId", "type", "updatedAt", "userId") SELECT "accountId", "amount", "categoryId", "createdAt", "date", "description", "id", "transferAccountId", "type", "updatedAt", "userId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "Transaction_userId_accountId_idx" ON "Transaction"("userId", "accountId");
CREATE INDEX "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId");
CREATE INDEX "Transaction_userId_type_date_idx" ON "Transaction"("userId", "type", "date");
CREATE INDEX "Transaction_userId_amount_idx" ON "Transaction"("userId", "amount");
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");
CREATE INDEX "Transaction_recurringExpenseId_idx" ON "Transaction"("recurringExpenseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");

-- CreateIndex
CREATE INDEX "Transfer_userId_fromAccountId_idx" ON "Transfer"("userId", "fromAccountId");

-- CreateIndex
CREATE INDEX "Transfer_userId_toAccountId_idx" ON "Transfer"("userId", "toAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOccurrence_transactionId_key" ON "RecurringOccurrence"("transactionId");

-- CreateIndex
CREATE INDEX "RecurringOccurrence_userId_status_idx" ON "RecurringOccurrence"("userId", "status");

-- CreateIndex
CREATE INDEX "RecurringOccurrence_userId_dueDate_idx" ON "RecurringOccurrence"("userId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOccurrence_recurringExpenseId_dueDate_key" ON "RecurringOccurrence"("recurringExpenseId", "dueDate");

-- Phase 7 data migration
-- ----------------------
-- Move every legacy transfer representation into the new Transfer table.
-- Balances are deliberately NOT touched here: they were already updated when
-- these rows were created, so total net worth is unchanged by this migration.
--
-- 1) Single-row transfers (`type = 'TRANSFER'`, accountId = source,
--    transferAccountId = destination).
INSERT INTO "Transfer" ("id", "amount", "date", "description", "userId", "fromAccountId", "toAccountId", "createdAt", "updatedAt")
SELECT "id", "amount", "date", "description", "userId", "accountId", "transferAccountId", "createdAt", "updatedAt"
FROM "Transaction"
WHERE "type" = 'TRANSFER'
  AND "transferAccountId" IS NOT NULL
  AND "accountId" <> "transferAccountId";

-- 2) Legacy two-row transfers produced by POST /api/transactions/transfer
--    (an EXPENSE leg on the source account paired with an INCOME leg on the
--    destination account). Those rows inflated income/expense analytics, so
--    they are moved out of Transaction entirely.
INSERT INTO "Transfer" ("id", "amount", "date", "description", "userId", "fromAccountId", "toAccountId", "createdAt", "updatedAt")
SELECT e."id", e."amount", e."date", e."description", e."userId", e."accountId", e."transferAccountId", e."createdAt", e."updatedAt"
FROM "Transaction" e
JOIN "Transaction" i
  ON i."userId" = e."userId"
 AND i."amount" = e."amount"
 AND i."date" = e."date"
 AND i."accountId" = e."transferAccountId"
 AND i."transferAccountId" = e."accountId"
WHERE e."type" = 'EXPENSE'
  AND i."type" = 'INCOME';

-- 3) Delete exactly the rows that now have a Transfer record (matched by id).
--    Deleting without reversing balances keeps every account balance identical
--    to what it was before the migration.
DELETE FROM "Transaction"
WHERE "id" IN (SELECT "id" FROM "Transfer");
