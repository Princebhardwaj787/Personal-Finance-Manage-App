# Audit Report — Personal Finance Management App

**Audit date:** 2026-10-18  
**Auditor:** Principal Software Architect (OpenCode agent)  
**Repository:** `D:\Mohit` (single `main` branch, one baseline commit `0d8ee3e`)  
**Status:** Phase 1 — Audit & stabilization complete (baseline established)

---

## 1. Executive summary

The repository contains a working, full-stack personal finance web application with a clean separation of concerns (React SPA + Node/Express REST API + Prisma/SQLite). The core personal-finance flows (accounts, categories, transactions, transfers, budgets, savings goals, recurring expenses, reports, notifications) are implemented and the codebase is well-organized into routes/controllers/services.

**However, the application is NOT production-ready as a financial platform.** The most serious finding is that all monetary amounts are stored and computed with binary floating point (`Float` / JavaScript `Number`), which can silently introduce rounding errors in financial records. Other production gaps: no rate limiting, no security headers, tokens in `localStorage`, no backup/restore, no isolated test database, no CI, and no business/invoicing/double-entry/payment-gateway modules required by the long-term scope.

Recommendation: treat this as a **Phase 1 stabilization effort** before adding the financial-platform features. Fix money precision, add a test runner with isolated databases, harden security, then phase in business accounting and payment integration.

---

## 2. Existing architecture and technology stack

### 2.1 Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18, Vite 5, React Router 6 | SPA, lazy-loaded chart components |
| Styling | Tailwind CSS 3 | Utility-first |
| Charts | Recharts | Lazy loaded on dashboard |
| HTTP client | Axios | Vite `/api` proxy to localhost:3001 in dev |
| Dates | date-fns + Intl | UTC-day strategy on server; `en-IN` formatting on client |
| Backend | Node.js ESM (v24), Express 4 | `type: module`, single `src/index.js` entry |
| Auth | JWT (access token), bcryptjs (12 salt rounds) | Tokens issued on register/login, sent `Authorization: Bearer` |
| Validation | express-validator | Per-route body/query rules |
| Persistence | Prisma 5 + SQLite (local file `dev.db`) | 7 migrations, schema current |
| PDF/CSV export | pdfkit, csv-stringify | Server-generated, streamed |
| Logging | morgan (`dev` format) + console | No structured logging, no redaction |
| Tests | 23 standalone Node scripts (`test_*.js`) at repo root | Hit a live API against `dev.db`; no test runner, no isolated DB |
| Lint/Build (client) | ESLint (`--max-warnings 0`), Vite build | Both pass cleanly |
| Lint/Build/Tests (server) | None configured | `package.json` has dev/start/prisma scripts only |

### 2.2 Project layout

```
client/          React SPA (Vite)
  src/
    components/  UI + page sub-components (dashboard, transactions, reports, ...)
    contexts/    AuthContext + AuthProvider (token in localStorage)
    hooks/       Data hooks (useAccounts, useTransactions, ...)
    pages/       Route-level pages (Dashboard, Transactions, Reports, ...)
    routes/      AppRoutes, ProtectedRoute
    services/    Axios API wrappers (one per domain)
    ui/          EmptyState, ErrorState
    utils/       format.js, period.js, constants.js
server/          Express API
  prisma/        schema.prisma, migrations/ (7), dev.db (local, gitignored)
  src/
    index.js     Express app + health check + scheduled notification processor
    config/      env.js, database.js (Prisma client singleton), jwt.js
    middleware/  auth.js, errorHandler.js, validation.js
    routes/      13 route groups under /api
    controllers/ thin controllers
    services/    business logic (transactions, transfers, budgets, ...)
    utils/       dateRange.js, goalCalculator.js, sortOrder.js, password.js, jwt.js, validators.js
test_*.js        23 regression suites (live API against dev.db)
.env / .env.example  Environment (gitignored; .env.example committed)
```

### 2.3 Configuration

`server/.env` exists locally (gitignored) with `DATABASE_URL=file:./dev.db`, `JWT_SECRET="dev-secret-key-change-in-production-min-32-chars"`, `PORT=3001`, `NODE_ENV=development`, `CLIENT_URL=http://localhost:5173`.

`server/.env.example` is committed and contains a placeholder JWT secret (`change-me-to-a-long-random-string`) that **must be rejected in production/release builds**.

### 2.4 Routes (`/api`)

`auth` (register, login, logout, me, profile, password), `accounts`, `categories`, `transactions` (+ `/transfer`, `/summary`, `/category-breakdown`, `/bulk-delete`, `/:id/duplicate`), `transfers`, `budgets`, `savings-goals`, `recurring-expenses` (+ `/process`), `dashboard` (+ `/summary`, `/widgets`, `/budget-overview`, `/recent-transactions`), `analytics`, `reports` (+ `/export`), `notifications`, `notification-preferences`. Health: `GET /api/health`.

All protected routes require `Authorization: Bearer <token>`; ownership is scoped by `userId` from the JWT in every service query.

---

## 3. Verification performed (baseline)

| Check | Tool/Command | Result |
|-------|-------------|--------|
| Schema validation | `npx prisma validate` (server) | **PASSED** |
| Migration status | `npx prisma migrate status` | **PASSED** — 7 migrations applied, schema current |
| Client lint | `npm run lint` (client) | **PASSED** — no diagnostics, `--max-warnings 0` |
| Client production build | `npm run build` (client) | **PASSED** — `dist/` emitted, ~409 kB JS gzipped |
| Server boot + health | `node src/index.js` then `GET /api/health` | **PASSED** — `{ status: "ok" }` |
| Live API regression tests | `node test_*.js` | **NOT RUN** — they write/delete records in `dev.db`. Running them requires user approval or a scratch copy of the database. |
| Server lint / type check / test | None configured | **NOT APPLICABLE** — no scripts exist |
| TypeScript check | No `tsconfig.json`, code is plain JS | **NOT CONFIGURED** |

Environment: Node.js v24.4.0, npm 11.13.0.

---

## 4. Current working and broken features

### 4.1 Working (per code review + PHASE_0_AUDIT.md)

- User registration, login, profile, password change (JWT issued/verified)
- Account CRUD with balance, currency (default INR), type, default-account guard
- Category CRUD with income/expense type; default categories seeded on registration
- Income/expense transactions: create, list (paginated, filtered, searched, sorted), get, update, delete, duplicate, bulk delete (max 200), summary, category breakdown
- Atomic balance updates inside Prisma transactions on create/update/delete of transactions
- Transfers between own accounts in a separate `Transfer` table (never counted as income/expense), conditional `balance >= amount` debit, atomic debit+credit+row
- Transfers deliberately excluded from income/expense reporting (consistent with the master prompt)
- Budgets with spent/remaining/percentage/status, bulk monthly recalculation from transactions
- Savings goals with contributions, atomic contribution + balance update, completion derived
- Recurring expenses with idempotent processor (`RecurringOccurrence` unique key), catch-up capped at 12, failure logging, dry-run, notifications
- Dashboard summary, income/expense trends, category spending, widgets (recent transactions, goals, upcoming)
- Reports: monthly, yearly, transactions, categories, budgets, accounts; CSV (streamed, batched) and PDF export; report history
- Notifications + preferences with idempotent dedupe keys; scheduled in-process processor (15 min, disabled in `NODE_ENV=test`)

### 4.2 Broken / weak areas found in code review

1. **Money precision (P0).** Schema columns are Prisma `Float` (SQLite `REAL`); all services parse amounts with `Number()` and compute with binary floating point (`round2` uses `Math.round((value + Number.EPSILON) * 100) / 100`). Repeated add/reverse cycles (e.g. transfer edit → undo → redo) can drift balances by fractions of a cent. **No authoritative minor-unit (integer paise) representation exists.**

2. **No isolated test database.** The 23 `test_*.js` suites target the configured `dev.db` and create/delete users/accounts/transactions. They are useful smoke/regression checks but are destructive against the configured database and have no setup/teardown.

3. **No test runner, lint, or type-check for the server.** `server/package.json` has no `test`, `lint`, or build script.

4. **Tokens in `localStorage`.** `AuthProvider` and `api.js` read/write `token` from `localStorage`, exposed to XSS in the browser context. The roadmap itself flags this.

5. **No rate limiting or brute-force protection.** Register/login are wide open to credential stuffing and enumeration.

6. **No security headers** (Helmet or equivalent): no CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy.

7. **Error handler exposes stack traces** in development (`err.stack` included when `NODE_ENV === 'development'`). Acceptable for dev, must be suppressed in production.

8. **Morgan `dev` logging** may log request bodies/URLs containing sensitive data; no redaction.

9. **Placeholder JWT secret** committed in `.env.example` and present in local `.env`. Must be rejected in production builds.

10. **No double-entry bookkeeping.** Single cash-basis ledger only; no journals, ledger accounts, posting rules, or accrual reports. Required for the business/accounting scope.

11. **No business module.** No workspaces, customers, suppliers, invoices, bills, payments, or allocations.

12. **No payment gateway integration.** No provider abstraction, webhooks, idempotency, or sandbox.

13. **No backup/restore.** CSV/PDF reports exist, but no versioned whole-data backup, restore validation, encryption, or documented recovery procedure.

14. **No CI.** No workflow for tests/lint/build on push.

15. **No Android/local-first boundary.** The server and financial rules are Express-bound; no Capacitor config, Android project, or client-side repository boundary.

16. **Desktop-oriented layout.** Sidebar is always rendered; small-screen navigation not connected to mobile state (per PHASE_0_AUDIT.md).

17. **Legacy schema debt.** `Account.transferTransactions` + `Transaction.transferAccountId` are legacy Phase 1-2 columns retained in the schema/database so no FK column ever has to be dropped. The code never writes them, but they remain in `schema.prisma` (also duplicated at `server/src/prisma/schema.prisma`, currently identical — a drift risk flagged in PHASE_0_AUDIT.md).

18. **Schema uses plain `String` enums** (e.g. `Category.type`, `Transaction.type`, `Account.type`, `RecurringExpense.frequency`) validated only in the service layer, not at the database level.

---

## 5. Security and privacy findings

| ID | Finding | Severity |
|----|---------|----------|
| S1 | JWT access token stored in browser `localStorage` — readable by any script, XSS exposure | High |
| S2 | No rate limiting on auth endpoints (register/login/password change) | High |
| S3 | No security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options) | Medium |
| S4 | Placeholder/default JWT secret present in `.env.example` and local `.env` | High |
| S5 | Error handler returns stack traces when `NODE_ENV=development` | Medium |
| S6 | Morgan `dev` logs may capture sensitive request data without redaction | Medium |
| S7 | No CORS preflight restriction beyond single origin; `credentials: true` — appropriate for SPA but must be reviewed when adding mobile clients | Medium |
| S8 | No account lockout / brute-force protection | High |
| S9 | File uploads (receipts/attachments) not yet implemented — no unsafe-upload vector currently, but no safe-storage pattern exists to extend into | Medium |
| S10 | No audit-events table for security-sensitive operations (login, password change, financial mutations) | Medium |
| S11 | No session revocation / token blacklist; JWTs valid until expiry | Medium |

Authorization is consistently scoped by `userId` at the query layer in every service — no direct IDOR vulnerability observed in the reviewed code. This must be preserved and extended when workspaces are added.

---

## 6. Database and data-integrity risks

| ID | Risk | Severity |
|----|------|----------|
| D1 | **Monetary values as binary `Float`** — the single greatest financial-integrity risk. Balances can drift over edit/delete/transfer cycles. | Critical |
| D2 | No unique constraint preventing a user from creating duplicate intentional transactions (e.g. same amount/date/account submitted twice). Idempotency exists only for recurring occurrences, not user-initiated payments. | Medium |
| D3 | No soft-deletion; hard delete of transactions/transfers is balance-reversed then removed atomically — acceptable for cash-basis personal use, but posted accounting entries (when double-entry is added) must never be silently modified/deleted. | Medium |
| D4 | Schema enums are untyped `String` columns; invalid values can be inserted if Prisma validation is bypassed. | Low |
| D5 | Migration `20260929200657_phase7_transfers_recurring` performs data migration that deletes `Transaction` rows after moving them to `Transfer`. Documented and balance-preserving, but destructive without an explicit rollback path. | Medium |
| D6 | `dev.db.pre-phase7.bak` and `phase5_fresh.db-journal` are stray files in `server/prisma/` (sqlite artifacts). Not tracked by git, but clutter the migration directory. | Low |
| D7 | No connection pooling configuration needed for SQLite (file DB), but no pool/limits configured for a future client-server database migration. | Low |
| D8 | Database backups: none; `dev.db` is a single local file with no automated or validated backup. | High |

Foreign keys, cascades, unique constraints, and indexes are present and appropriate for the current single-user cash-basis model. Every financial record carries `userId` and all queries filter by it — user isolation holds at the query layer.

---

## 7. Recommended improvements

### Phase 1 — Audit & stabilization (immediate)

1. **Money precision.** Introduce integer minor units (paise) as the authoritative storage type for all monetary columns (`amount`, `balance`, `targetAmount`, `currentAmount`, budget/spent, etc.). Add centralized currency helpers (format/parse/round) and a tested migration plan. Do not add new financial features on `Float` until this is resolved.
2. **Test infrastructure.** Add a test runner (e.g. Vitest or plain Node with `node:test`), an isolated test database (`DATABASE_URL=file:./test.db` or in-memory), and migrate the critical balance/transfer/transaction tests out of the destructive `test_*.js` suite.
3. **Security.** Rate limiting on auth, security headers (Helmet or manual middleware), reject placeholder JWT secret in non-development builds, structured logging with redaction, audit-events table for sensitive operations.
4. **Server quality gates.** Add `test`, `lint` (ESLint), and type-check scripts to `server/package.json`.
5. **Small-screen navigation.** Fix the sidebar/mobile layout foundation without redesigning working financial workflows.
6. **Documentation.** Write the backup/recovery strategy and deployment checklist.

### Phase 2 — Architecture & data integrity

Integer-paise migration, database transactions for all multi-record financial operations, idempotency keys for user-initiated payments, enum constraints/check constraints, indexes aligned to access patterns.

### Phase 3 — Personal finance core

Complete accounts, transactions, transfers, budgets, recurring entries, dashboard accuracy (all on integer paise), payment-method tags, transaction status, receipts/attachments (safe storage).

### Phase 4 — Business management

Business profiles/workspaces, customers, suppliers, invoices, bills, payment allocations, cash-flow reporting. Keep personal and business records logically separated; every financial record belongs to a user/workspace/account.

### Phase 5 — Accounting foundation

Double-entry bookkeeping: accounts, journal entries, journal lines, accounting periods, immutable posted entries, correction/reversal workflows, cash-basis vs accrual-basis reports.

### Phase 6 — Payment gateway

Provider abstraction (Razorpay/Stripe sandbox), backend-created payment orders, signature/webhook verification, idempotent processing, reconciliation, refunds. Secrets server-side only; no raw card data stored.

### Phase 7 — Security & performance

Authorization review at server + DB-query layers, dependency scanning, query optimization, pagination bounds, caching only where correctness is preserved, performance baselines.

### Phase 8 — Testing & deployment

Unit/integration/API/accounting/invoice/payment/isolation/backup-restore/E2E tests, CI, production configuration, monitoring, backups, recovery documentation, rollback guide.

### Phase 9 — Android preparation

Evaluate stack for local-first Android. The Express + filesystem-SQLite architecture **cannot** be packaged as a reliable device-local Android app by adding Capacitor alone. Introduce a client-side repository/domain boundary and a transactional device database (SQLite on Android; browser/SQLite implementation for development), with business logic executable on-device or behind the shared boundary. Design sync/conflict/encryption explicitly if website and Android will share data later.

---

## 8. Phased implementation roadmap

| Phase | Focus | Dependencies | Acceptance criteria (indicative) |
|-------|-------|--------------|----------------------------------|
| 1 | Audit & stabilization | Baseline complete | `AUDIT_REPORT.md` published; money-precision plan; test runner + isolated DB; security hardening; mobile nav fixed; quality gates pass |
| 2 | Architecture & data integrity | Phase 1 | Integer paise storage; tested migration; atomic multi-record operations; idempotency keys; constraints/indexes |
| 3 | Personal finance core | Phase 2 | Balances reconcile; transfers excluded from income/expense; budgets/recurring accurate; receipts |
| 4 | Business management | Phase 2 | Workspaces, customers, suppliers, invoices, bills, allocations; RBAC; logical separation of personal/business |
| 5 | Accounting foundation | Phase 4 | Balanced journal entries; posted-entry immutability; reversal/correction; cash vs accrual reports |
| 6 | Payment gateway | Phase 5 | Sandbox provider; signature-verified webhooks; idempotent allocation; reconciliation; refunds |
| 7 | Security & performance | Phase 6 | AuthZ review; dependency scan; query optimization; rate limiting; security headers; measured baselines |
| 8 | Testing & deployment | Phase 7 | Full automated suite; CI; production build/migrations reproducible; tested backup/restore; ops docs |
| 9 | Android preparation | Phase 8 | Local-first device DB; repository boundary; offline entry/view; manual backups; (optional) sync design |

---

## 9. Definition of done (per master prompt)

The platform is production-ready only when:
- Existing functionality remains operational.
- Core financial calculations are tested and correct.
- Balances reconcile with underlying financial records.
- Posted accounting entries remain balanced and traceable.
- User/workspace isolation tests pass.
- Payment callbacks are verified and idempotent.
- Invoice and payment statuses remain consistent.
- Sensitive information is protected.
- Critical workflows have automated tests.
- Production builds and migrations are reproducible.
- Backup/restore procedures tested.
- Performance measured against defined targets.
- Deployment/recovery/operational documentation exists.
- Every incomplete integration and known limitation documented.

---

## 10. Immediate next steps (Phase 1 execution)

1. **Write AUDIT_REPORT.md** ✅ (this document)
2. **Set up isolated test database + test runner** so money-precision changes can be validated safely without touching `dev.db`.
3. **Money precision migration** — convert monetary columns to integer minor units (paise) with a tested, rollbackable migration; add currency helpers; update all services/controllers/routes and client formatting.
4. **Security hardening** — rate limiting on auth, security headers, reject placeholder JWT secret in production, structured logging with redaction.
5. **Server quality gates** — add `test`, `lint`, type-check scripts to `server/package.json`.
6. **Mobile navigation fix** — connect sidebar to mobile state.
7. **Documentation** — backup/recovery strategy, deployment checklist.

Run commands established so far (all pass):
- `cd server && npx prisma validate` — passed
- `cd server && npx prisma migrate status` — passed (schema current)
- `cd client && npm run lint` — passed (`--max-warnings 0`)
- `cd client && npm run build` — passed (production `dist/` emitted)
- `cd server && node src/index.js` then `GET http://localhost:3001/api/health` — passed (`{ status: "ok" }`)
