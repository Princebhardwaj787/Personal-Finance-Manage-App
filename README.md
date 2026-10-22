# Personal Finance Management App

A full-stack personal finance application: accounts, transactions, transfers,
budgets, savings goals, recurring expenses, analytics, reports (CSV/PDF
export) and notifications — built for real-world daily use.

**It also runs as a native Android app** with every financial record stored
on the device, working fully offline.

## Documentation

| Document | What it covers |
|----------|----------------|
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | Repository audit: architecture, findings, risks, roadmap |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Web deployment, rollback, incident response, readiness checklist |
| [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) | Server-side backup/restore and recovery runbook |
| [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md) | **Building, signing and installing the Android APK** |
| [docs/ANDROID_TEST_REPORT.md](docs/ANDROID_TEST_REPORT.md) | **What was verified on a device, and what was not** |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | The original phase-by-phase plan |

## The two builds

|  | Web | Android |
|---|---|---|
| Data location | The server's SQLite database | **A SQLite database on the device** |
| Network | Required | **Not required** |
| Sign-in | Email + password | None (the device owner is the user) |
| Backups | `npm run db:backup` | In-app export/import (versioned JSON) |

Both share the **same** financial rules: the pure domain code lives in
`shared/` and is imported by the server *and* the client, so the two can never
disagree about a number.

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS 3, Recharts, React Router 6, axios, date-fns |
| Backend  | Node.js (ESM), Express 4, Prisma 5 + SQLite, JWT auth, express-validator, helmet, express-rate-limit, pdfkit, csv-stringify |
| Android  | Capacitor 8, `@capacitor-community/sqlite`, AGP 8.13 / Gradle 8.14 / JDK 21 |
| Tests    | Vitest — 39 server tests + 62 client tests |

## Project Structure

```
shared/                Pure domain rules used by BOTH the server and the client
  money.js               integer minor units (paise) <-> decimal
  dateRange.js           the single UTC-calendar-day date strategy
  goalCalculator.js      savings-goal status and progress
  budgetCalculator.js    budget status and percentages
  recurringCalculator.js recurrence maths
  AppError.js            the shared error type

client/              React SPA (Vite) + Capacitor
  src/
    components/      Reusable UI (dashboard charts, forms, layout, reports)
    contexts/        AuthContext (useAuth) + AuthProvider
    data/            ON-DEVICE storage (Android)
      db.js            the Database port (execute / select / transaction)
      schema.js        versioned DDL + migrations
      adapters/        capacitorSqlite (device) · nodeSqlite (tests)
      services/        accounts, categories, transactions, transfers, budgets,
                       goals, recurring, analytics, reports, notifications
      backup.js        versioned JSON export / validate / restore
      store.js         wires the services onto one connection
    pages/           Route-level pages
    routes/          AppRoutes, ProtectedRoute
    services/        API layer: HTTP (web) or local (Android)
    utils/           format.js, period.js, constants.js
  android/          The Capacitor Android project
  assets/           Icon and splash source artwork
server/              Express API
  prisma/            schema.prisma, migrations/, seed.js, dev.db (local)
  scripts/           backup.js, restore.js, smoke.js
  src/
    routes/          13 route groups mounted under /api
    services/        Business logic (reports, analytics, notifications, ...)
    middleware/      Auth, validation, security (rate limit + headers), logging
    utils/           re-exports of the shared domain rules
  tests/             Vitest suites: unit/, integration/, helpers/
docs/               Deployment, backup/recovery and Android documentation
test_*.js            Legacy regression scripts (see note below)
```

## Money Handling

**All monetary amounts are stored as integer minor units (paise).** No binary
floating-point arithmetic is used for any authoritative calculation.

| Layer | Representation |
|-------|----------------|
| Database (`Account.balance`, `Transaction.amount`, budgets, goals, transfers, contributions) | `Int` minor units — ₹1,000.00 is stored as `100000` |
| API request/response | decimal major units — `1000` in, `1000` out |
| Service layer | integer minor units throughout (exact) |

The conversion happens at the API boundary only, in `shared/money.js`. This is
enforced by the test suite (`server/tests/unit/money.test.js`,
`server/tests/integration/balance.test.js`,
`server/tests/integration/api-money.test.js`,
`client/src/data/schema.parity.test.js`).

> **Migration note:** the schema previously used `Float`. Migration
> `20261018233000_convert-monetary-columns-to-minor-units` converted every
> stored value (×100) and changed the column types. A pre-migration backup of
> the development database is kept at
> `server/prisma/dev.db.pre-money-migration.bak`.

## Building the Android app

```bash
cd client
npm install

# Build the web assets for Android (relative asset paths + the on-device
# data source) and copy them into the Android project.
CAPACITOR_ANDROID=true VITE_NATIVE_BUILD=true npm run build   # macOS/Linux
npx cap sync android

cd android
# The Android Gradle Plugin needs JDK 17 or 21.
JAVA_HOME="C:/Users/<you>/tools/jdk-21" ./gradlew.bat assembleDebug assembleRelease
```

| APK | Path |
|-----|------|
| Debug | `client/android/app/build/outputs/apk/debug/app-debug.apk` |
| **Release (signed)** | `client/android/app/build/outputs/apk/release/app-release.apk` |

Install it with `adb install -r <apk>` or by copying the file to the phone
and opening it.

Full instructions — JDK setup, release signing, installing, updating, and
moving data between the web app and the phone — are in
**[docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md)**.

## Getting Started

Prerequisites: Node.js 20+ (developed on v24) and npm.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
# Generate a real secret for JWT_SECRET (the placeholder is rejected in production):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npx prisma migrate deploy   # creates prisma/dev.db and applies migrations
npm run db:seed             # optional: clearly-labelled demo data
npm run dev                 # or: npm start  (PORT from .env, default 3001)
```

Health check: <http://localhost:3001/api/health>

### 2. Frontend

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:3001` (see `client/vite.config.js`),
so no client-side configuration is needed.

## Environment Variables

`server/.env` (copy from `server/.env.example`):

| Variable         | Required | Default                 | Purpose                              |
|------------------|----------|-------------------------|--------------------------------------|
| `DATABASE_URL`   | yes      | `file:./dev.db`         | SQLite database file (Prisma)        |
| `JWT_SECRET`     | yes      | —                       | Signing key for access tokens        |
| `JWT_EXPIRES_IN` | no       | `7d`                    | Token lifetime                       |
| `PORT`           | yes      | `3001`                  | API port                             |
| `NODE_ENV`       | no       | `development`           | Environment name                     |
| `CLIENT_URL`     | yes      | `http://localhost:5173` | Allowed CORS origin                  |
| `LOG_LEVEL`      | no       | `info`                  | Log verbosity                        |
| `TRUST_PROXY`    | no       | `false`                 | Trust `X-Forwarded-*` (reverse proxy)|

The server **refuses to start** when `JWT_SECRET` is a known placeholder in
production, or shorter than 32 characters in production.

Never commit real secrets: `.env` is git-ignored; `.env.example` is the template.

## Database

SQLite via Prisma. Migrations live in `server/prisma/migrations/`:

```
init → transfer relation → savings/recurring → transfers
→ legacy transfer cleanup → report history → notifications
→ convert monetary columns to minor units → audit events
```

- Apply/create: `npx prisma migrate dev` (from `server/`)
- Apply only (production): `npm run prisma:deploy`
- Reset local data: `npx prisma migrate dev --force-reset` then `npm run db:seed`
- Inspect: `npm run prisma:studio`

## Backup and restore

```bash
cd server
npm run db:backup                              # validated, consistent snapshot
npm run db:restore -- --file prisma/backups/<file>.db
```

Both commands validate integrity and row counts, and refuse to report success
for a broken backup. Full procedure: [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md).

## API Overview

All endpoints are mounted under `/api` and require `Authorization: Bearer <token>`
except register/login and health.

```
auth   register, login, me, profile, change-password
accounts · categories · transactions · budgets
savingsGoals · recurringExpenses · transfers
dashboard (summary, cashflow, top categories, trends)
analytics (insights, trends, category/budget overviews)
reports (monthly/yearly/categories/budgets/accounts/transactions
         + /export CSV & PDF, report history)
notifications · notificationPreferences
```

Amounts in requests and responses are decimal major units (e.g. `1000.50`).

## Tests

**Server** — the Vitest suite runs against an **isolated** `test.db`; it never
touches `dev.db`. The database is recreated and migrated before each file.

```bash
cd server
npm test               # 39 tests
npm run test:watch
npm run lint
```

Suites cover money conversion, balance correctness across
create/update/delete/transfer/duplicate cycles, the API money contract,
rounding, amount filters, user isolation, security headers, rate limiting,
the audit trail and log redaction.

**Client** — the on-device data layer is tested against a **real SQLite
database** (Node's built-in `node:sqlite`), so the exact SQL that ships to
the phone is exercised in CI.

```bash
cd client
npm test               # 62 tests
npm run lint
```

Suites cover the on-device schema (and its **parity** with the server's
Prisma schema), the local services (accounts, categories, transactions,
transfers, budgets, goals), the versioned backup format (export, validation,
preview, restore, malformed input) and the money rules.

> **Legacy note:** the 23 `test_*.js` scripts at the repository root hit a
> live API against the *configured* database and create/delete records. They
> are superseded by the Vitest suite. Use Vitest for anything automated.

## Quality Gates

```bash
cd server
npm test                # must exit 0
npm run lint            # must exit 0

cd ../client
npm test                # must exit 0
npm run lint            # ESLint, --max-warnings 0
npm run build           # production build (vite build)
```

All five must exit 0 before considering a change complete.

## Security

- Passwords hashed with bcrypt (12 rounds).
- JWT access tokens; all protected routes re-check ownership at the query layer.
- Rate limiting on register / login / password change, plus a global API ceiling.
- Security headers via helmet (CSP, HSTS in production, nosniff, frame-ancestors).
- Structured, redacted logging — bodies are never logged, secrets and e-mail
  addresses are masked.
- Append-only audit trail for logins and money-moving operations.

**On Android** the app additionally:

- Stores everything in the app's **private** storage (`/data/data/…`).
- Disables Android cloud backup and device-to-device transfer
  (`allowBackup="false"` + `data_extraction_rules.xml`), so financial records
  are never copied by the system.
- Refuses cleartext HTTP and hides the framework version.
- Requests **no** storage, camera, contacts, location or microphone permission.
- Ships `webContentsDebuggingEnabled: false` in release builds.

## Known limitations

See [docs/DEPLOYMENT.md §10](docs/DEPLOYMENT.md) and
[docs/ANDROID_BUILD.md §9](docs/ANDROID_BUILD.md) for the full lists.

In short: no business workspaces, no double-entry accounting, no payment
gateway, no receipt storage, no automated or encrypted backups, and no CI
workflow file yet. On Android the database is **not** encrypted, there is no
biometric app lock, recurring transactions are processed when the app opens
rather than by a background job, and the screen is locked to portrait.
