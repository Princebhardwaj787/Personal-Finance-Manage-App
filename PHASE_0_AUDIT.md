# Phase 0 — Repository Audit

Audit date: 2026-10-17

## Existing architecture

- **Client:** React 18 single-page application built with Vite 5, React Router,
  Tailwind CSS, Axios, Recharts, and date-fns.
- **Server:** Node.js ESM + Express REST API with JWT bearer authentication.
- **Persistence:** Prisma 5 using a local SQLite database (`server/prisma/dev.db`)
  and seven version-controlled migrations.
- **Testing:** 23 standalone Node scripts at the repository root. They exercise a
  running API and do not use an isolated test database or a package test runner.

The client currently calls the Express API through Vite's `/api` development
proxy. This is a browser/server deployment, not an offline Android architecture.

## Implemented capabilities

The app already has authenticated user accounts, accounts, editable categories,
income and expense transactions, atomic transfers, paginated transaction search
and filters, budgets, savings goals and contribution history, recurring expenses
with idempotency records, dashboard analytics, CSV/PDF reports, and in-app
notifications. Transaction, transfer, recurring, and balance-changing operations
generally use Prisma transactions. Transfers are deliberately modeled separately
from income/expense transactions, which prevents them from affecting income and
expense reporting.

## Verification performed

- `npx prisma validate`: passed.
- `npx prisma migrate status`: passed; seven migrations are applied and the
  SQLite schema is current.
- Client lint and production-build commands were invoked. They produced no lint
  diagnostics in the available command output and emitted the Vite distribution
  files; the command bridge did not return a final process-status line.
- The live API regression scripts were not run because they target the configured
  development SQLite database and can create and delete records. No existing
  database data was reset or changed for this audit.

## Priority findings

### P0 — Android and local-first gap

Capacitor is a suitable shell for the existing React UI, but cannot package the
current Express server and its filesystem SQLite database as a reliable Android
application. The app therefore cannot meet the device-local/offline requirement
by simply adding Capacitor. The next phase should introduce a client-side local
data/repository boundary and a transactional device database (SQLite on Android,
with an appropriate browser development implementation). Business operations
must move from Express-only services to code that can execute on device or be
reimplemented behind that shared boundary.

### P0 — financial precision

All monetary schema columns are Prisma `Float`, and client/services parse amounts
with JavaScript floating point. This can introduce rounding errors. Migrate new
and existing financial values to integer paise before adding more financial
features. This requires a deliberate, tested migration and centralized currency
formatting/conversion helpers.

### P0 — backup, restore, and recovery absent

CSV/PDF reports are available, but there is no versioned whole-data backup,
restore validation/staging, recovery backup, encryption option, Android document
picker integration, or documented recovery procedure.

### P1 — mobile usability and product gaps

- The current layout is desktop-sidebar oriented. On small screens the sidebar is
  always rendered as visible and is not connected to `sidebarOpen`; its close
  button has no handler. A phone-first navigation redesign is required.
- No Capacitor configuration, Android project, app icon/package metadata, native
  file handling, safe-area handling, lifecycle/back-navigation integration, or
  Android build instructions exist.
- Accounts cannot be archived; only deletion is implemented (and guarded).
- Transactions do not model payment methods, tags, subcategories, or transaction
  status. Recurrence supports expenses only; there is no bill model or native
  reminder scheduling.
- Budgets are monthly calendar records only. Custom periods, rollover, per-budget
  warning thresholds, and historical comparisons are not implemented.
- Settings are limited mainly to profile and notification preferences. Theme,
  app lock, secure erase, comprehensive preferences, and full backup controls
  are absent.

### P1 — privacy and operational concerns

- Authentication tokens are stored in browser `localStorage`, which is exposed to
  XSS in a browser context. An Android app should use secure native storage for
  lock/auth material, with a clearly defined local-only threat model.
- The default environment template includes a placeholder JWT secret that must be
  rejected in production/release builds.
- An in-process server timer drives notification processing. It does not provide
  dependable Android background execution and must not be represented as a native
  reminder feature.
- `server/src/prisma/schema.prisma` duplicates the canonical schema. It is
  currently identical but is a future drift risk.

### P2 — testability and maintainability

- No `test` script, unit test runner, or isolated test database is configured.
  Current scripts are useful smoke/regression checks but are destructive against
  the configured database unless separately provisioned.
- The existing backend is well-organized into routes/controllers/services, but
  key financial rules are server-bound. A shared pure-domain layer is needed for
  the Android-local architecture.

## Recommended Phase 1 scope

1. Preserve the existing UI and REST API while defining a local repository and
   domain-calculation interface.
2. Add integer-paise money helpers and migration planning/tests before changing
   persisted amounts.
3. Select and prototype the SQLite adapter for Android and a browser development
   adapter; prove persistence across reloads/restarts with a clean test database.
4. Establish a safe automated test runner with temporary databases and migrate
   the critical balance/transfer/transaction tests first.
5. Fix the small-screen layout/navigation foundation without redesigning working
   financial workflows yet.

Do not add Capacitor or migrate production data until the local persistence
boundary and a migration/backup strategy have been verified.
