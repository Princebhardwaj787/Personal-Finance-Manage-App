# Backup, Recovery and Restore Procedures

**Applies to:** Personal Finance Management App (Phase 1)
**Last verified:** 2026-10-21 — the full backup → mutate → restore → verify round trip was executed against the real development database.

---

## 1. What is being backed up

The application stores all of its data in a single SQLite database file
(`server/prisma/dev.db` by default, or whatever `DATABASE_URL` points to).

That file contains **all** financial records: users, accounts, categories,
transactions, transfers, budgets, savings goals and contributions, recurring
expenses and their occurrence log, report history, notifications and the audit
trail. There is no other datastore — the SQLite file *is* the system of record.

**Consequence:** losing that file means losing the user's financial history.
It is the single most important file in the deployment.

---

## 2. Creating a backup

```bash
cd server
npm run db:backup
```

By default the backup is written to `server/prisma/backups/finance-backup-<timestamp>.db`.

Custom destination:

```bash
npm run db:backup -- --out /mnt/backups/finance
npm run db:backup -- --file /mnt/backups/finance-2026-10-21.db
```

### What makes this a *safe* backup

1. **Consistent snapshot.** The backup is produced with SQLite's
   `VACUUM INTO`, which writes a fresh, defragmented copy that is safe to
   take while the database is open. A plain file copy of a live SQLite file
   can be torn and is not a valid backup.
2. **Integrity validated.** `PRAGMA integrity_check` must return `ok`.
3. **Contents validated.** The row count of every table is compared between
   the source database and the backup. Any mismatch aborts the operation.
4. **No false success.** If validation fails, the invalid file is deleted and
   the command exits with a non-zero status. A scheduled job or CI step can
   therefore never silently record a broken backup.
5. **Never overwrites.** The script refuses to overwrite an existing backup
   file.

Sample output:

```
Backing up D:\Mohit\server\prisma\dev.db
      ->  D:\Mohit\server\prisma\backups\finance-backup-2026-10-21T12-55-19.db

Backup validated successfully.
  integrity_check : ok
  tables compared : 14
  size            : 2404.0 KB
```

---

## 3. Restoring a backup

> **Stop the API server before restoring.** On Windows (and on any platform
> where the database file is memory-mapped) an open connection locks the
> file and the replacement will fail. The restore script releases its own
> connection and reports a clear, actionable error if the file is still held
> by another process.

```bash
cd server
# 1. Stop the server (Ctrl+C in its terminal, or `systemctl stop finance-api`).

# 2. Restore — the script asks for confirmation and validates first.
npm run db:restore -- --file prisma/backups/finance-backup-2026-10-21T12-55-19.db

# 3. Confirm with "yes" when prompted.
```

For non-interactive use (automation, runbooks):

```bash
npm run db:restore -- --file prisma/backups/<file>.db --yes
```

### What the restore does

1. Validates the backup **before touching the live database**:
   - `PRAGMA integrity_check` must return `ok`;
   - every table the application requires must be present (a backup missing
     any of them is rejected as "not created by this application").
2. Copies the current live database to `<db>.pre-restore.db`, so **a restore
   can itself be undone**.
3. Replaces the live database with the validated copy.

### Undoing a restore

```bash
cd server
# Stop the server first, then:
npm run db:restore -- --file prisma/dev.db.pre-restore.db --yes
```

---

## 4. Verifying the round trip

A scripted check of backup → mutate → restore → verify:

```bash
cd server
node scripts/verify-backup-restore.mjs
```

> ⚠️ **This script DELETES all user records from the configured database in
> order to test the restore.** Never run it against a database that holds
> real financial data. It is a development/CI tool only.

Expected output:

```
1. Backup created: .../finance-backup-2026-10-21T12-55-19.db
2. Mutated. users 1 -> 0, transactions now 0 (was 5)
3. Restored.
4. Verified. users=1 (expected 1), transactions=5 (expected 5)
ROUND TRIP OK
```

---

## 5. Recommended schedule

| Environment | Frequency | Where to keep it |
|-------------|-----------|------------------|
| Personal / single-device | Before every app update, and daily (automated) | A second physical location (external drive / cloud folder) |
| Small business / shared | Daily, kept off-site | Encrypted cloud storage with versioning |

### Automating it (Linux/macOS, cron)

```cron
# Every day at 02:15 — write to a dated folder, keep 30 days
15 2 * * * cd /srv/finance/server && /usr/bin/npm run db:backup -- --out /srv/backups/finance >> /var/log/finance-backup.log 2>&1
30 3 * * * find /srv/backups/finance -name '*.db' -mtime +30 -delete
```

A backup that only exists on the same machine as the application is not a
backup. Keep at least one copy on different physical media.

---

## 6. Local vs. off-device backups (personal deployment)

For the intended personal, device-only use case there are two distinct
mechanisms, and they should not be confused:

| | **Local backup** | **Off-device backup** |
|---|---|---|
| What it is | A copy of `dev.db` on the same machine | A copy on different media / in the cloud |
| Protects against | Corruption, bad migration, accidental deletion | Disk failure, device loss, theft, ransomware |
| Encryption | Filesystem only | Must be encrypted (see below) |
| Tooling | `npm run db:backup` | `npm run db:backup` + an encrypted sync target |

**Backups produced by `npm run db:backup` are NOT encrypted.** SQLite stores
data in cleartext pages. If the backup leaves the device, either:

- place the backup directory on an encrypted volume (BitLocker / FileVault /
  `gpg` / `age` / restic), or
- encrypt the backup file itself before uploading it.

Example with `age`:

```bash
npm run db:backup -- --file /tmp/finance.db
age -r age1YOURRECIPIENTPUBLICKEY -o /tmp/finance.db.age /tmp/finance.db
# upload /tmp/finance.db.age — it is safe to store anywhere
```

---

## 7. Recovery runbook

### Symptom: the database file is missing or corrupt

1. Stop the server.
2. List the available backups:
   ```bash
   ls -lh prisma/backups/
   ```
3. Validate the chosen backup **before** restoring (the restore script does
   this automatically, but you can check manually):
   ```bash
   npx prisma db execute --file /dev/null  # no-op, ensures prisma is available
   sqlite3 prisma/backups/<file>.db "PRAGMA integrity_check;"
   ```
4. Restore:
   ```bash
   npm run db:restore -- --file prisma/backups/<file>.db --yes
   ```
5. Start the server and verify:
   ```bash
   curl http://localhost:3001/api/health
   ```
6. Spot-check the data in the UI (balances, transaction counts, savings goals).

### Symptom: balances do not match the transactions

This indicates a historical inconsistency, not a backup problem. Because
balances are maintained incrementally (they are not recomputed from
transactions on every read), a restored database carries whatever balance
state it had at backup time.

To rebuild balances from the transaction history, run the reconciliation
utility (see §8) after restoring.

---

## 8. Reconciliation

`Account.balance` is a running total maintained atomically with every
transaction, transfer and recurring occurrence. It is exact, but it is
*derived* state. The transaction history is the source of truth.

To verify or rebuild balances from the transaction history:

```sql
-- For each account: opening balance + INCOME - EXPENSE + transfers in - transfers out
SELECT a.id, a.name, a.balance AS stored_balance,
       COALESCE(t.income, 0) - COALESCE(t.expense, 0)
         + COALESCE(t.transfer_in, 0) - COALESCE(t.transfer_out, 0) AS net_from_transactions
FROM "Account" a
LEFT JOIN (
  SELECT accountId,
         SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) AS expense
  FROM "Transaction" GROUP BY accountId
) t ON t.accountId = a.id
WHERE a.userId = '<user-id>';
```

The stored balance must equal the opening balance plus the net movement. The
automated balance tests in `server/tests/integration/balance.test.js` assert
exactly this property for every create/update/delete/transfer cycle.

---

## 9. Data export for portability

Independent of the operational backup, the application can export reports:

- **CSV** — `GET /api/reports/export/:type?format=csv` (transactions,
  categories, budgets, accounts). Streamed in batches of 500 rows.
- **PDF** — `GET /api/reports/export/:type?format=pdf` (monthly, yearly).

These are *reports*, not backups: they are filtered, formatted views and
cannot be used to restore the database. Use `npm run db:backup` for that.

---

## 10. Known limitations (Phase 1)

| Limitation | Impact | Planned in |
|------------|--------|------------|
| Backups are not encrypted by the tool itself | Encrypted volume or file-level encryption is required for off-site copies | Phase 8 |
| No automatic scheduled backup | The operator must schedule it | Phase 8 |
| No point-in-time recovery | Only "as of the last backup" is recoverable | Phase 8 (managed DB) |
| Backups are full-database only | Large databases produce large backups | Phase 8 |
| Restore requires the server to be stopped | Brief downtime during recovery | Phase 8 |
| Single-file database | No concurrent write scaling | Phase 4 (business deployment) |

These are documented limitations of the current architecture, not silent
gaps. They are tracked in `AUDIT_REPORT.md` §7.
