# Personal Finance Management App

A full-stack personal finance application: accounts, transactions, budgets,
savings goals, recurring expenses, transfers, analytics, reports (CSV/PDF
export) and notifications — built for real-world daily use.

See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) for the original
phase-by-phase plan. All nine phases are implemented and covered by the
regression suites described below.

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS 3, Recharts, React Router 6, axios, date-fns |
| Backend  | Node.js (ESM), Express 4, Prisma 5 + SQLite, JWT auth, express-validator, pdfkit, csv-stringify |
| Tests    | 23 standalone Node test suites exercising the live API |

## Project Structure

```
client/              React SPA (Vite)
  src/
    components/      Reusable UI (dashboard charts, forms, layout, reports)
    pages/           Route-level pages
    contexts/        AuthContext (useAuth) + AuthProvider
    hooks/           Data hooks (useAccounts, useCategories, ...)
server/              Express API
  prisma/            schema.prisma, migrations/, seed.js, dev.db (local)
  src/
    routes/          13 route groups mounted under /api
    services/        Business logic (reports, analytics, notifications, ...)
    middleware/      Auth, validation, error handling
    utils/           Date-range and helpers
test_*.js            Regression suites (run against a live server)
DEVELOPMENT_ROADMAP.md
```

## Getting Started

Prerequisites: Node.js 20+ (developed on v24) and npm.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
npx prisma migrate dev      # creates prisma/dev.db and applies migrations
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

| Variable        | Required | Default                 | Purpose                              |
|-----------------|----------|-------------------------|--------------------------------------|
| `DATABASE_URL`  | yes      | `file:./dev.db`         | SQLite database file (Prisma)        |
| `JWT_SECRET`    | yes      | —                       | Signing key for access tokens        |
| `JWT_EXPIRES_IN`| no       | `7d`                    | Token lifetime                       |
| `PORT`          | yes      | `3001`                  | API port                             |
| `NODE_ENV`      | no       | `development`           | Environment name                     |
| `CLIENT_URL`    | yes      | `http://localhost:5173` | Allowed CORS origin                  |

Never commit real secrets: `.env` is git-ignored; `.env.example` is the template.

## Database

SQLite via Prisma. Migrations live in `server/prisma/migrations/`:

```
init → transfer relation → savings/recurring → transfers
→ legacy transfer cleanup → report history → notifications
```

- Apply/create: `npx prisma migrate dev` (from `server/`)
- Reset local data: `npx prisma migrate dev --force-reset` then `npm run db:seed`
- Inspect: `npm run prisma:studio`

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

## Tests

23 regression suites at the repository root. They hit the live API, so start
the server first (`PORT=3001`):

```bash
# One suite
node test_phase9_notifications.js

# Full regression
for f in test_*.js; do node "$f" >/dev/null 2>&1 || echo "FAIL $f"; done
```

Suites cover auth, accounts, transactions, budgets, dashboard, analytics,
recurring, savings, transfers, reports/export, notifications, the built
frontend routes, and the Vite proxy.

## Quality Gates

```bash
cd client
npm run lint     # ESLint, --max-warnings 0
npm run build    # Production build (vite build)
```

Both must exit 0 before considering a change complete.
