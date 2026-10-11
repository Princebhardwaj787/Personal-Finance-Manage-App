-- Fix-up for 20260929200657_phase7_transfers_recurring
--
-- The paired INCOME leg of a legacy two-row transfer was not recorded in
-- "Transfer" (only the EXPENSE leg's id was used as the Transfer id), so it
-- survived as artificial income. Delete any INCOME row whose movement is
-- already represented by a Transfer record.
--
-- Account balances are never recomputed from transaction rows, so this cannot
-- change any account balance — it only stops the same money being counted
-- twice (once as income, once as a transfer).
DELETE FROM "Transaction"
WHERE "type" = 'INCOME'
  AND "transferAccountId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "Transfer" tr
    WHERE tr."userId" = "Transaction"."userId"
      AND tr."amount" = "Transaction"."amount"
      AND tr."date" = "Transaction"."date"
      AND tr."fromAccountId" = "Transaction"."transferAccountId"
      AND tr."toAccountId" = "Transaction"."accountId"
  );
