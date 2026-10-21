# Deployment, Rollback and Production Readiness

**Applies to:** Personal Finance Management App (Phase 1)
**Status:** Phase 1 stabilised. The checklist at the end states precisely what is
production-ready today and what is **not** yet covered.

---

## 1. Environments

| | Development | Test | Production |
|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `production` |
| `DATABASE_URL` | `file:./dev.db` | `file:./test.db` (auto-managed) | `file:/var/lib/finance/finance.db` |
| `JWT_SECRET` | developer secret | auto-generated throwaway | unique, ≥ 32 chars, from a secret manager |
| `CLIENT_URL` | `http://localhost:5173` | n/a | the real origin of the SPA |
| `LOG_LEVEL` | `debug` | `error` | `info` |
| `TRUST_PROXY` | `false` | `false` | `true` **only** behind a reverse proxy you control |

Configuration is read once at start-up in `server/src/config/env.js`. The
process **refuses to start** when a required variable is missing, when the
JWT secret is a known placeholder, or when the production JWT secret is
shorter than 32 characters.

### Creating a production secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 2. Build

```bash
# Backend
cd server
npm ci
npm run prisma:generate
npm run prisma:deploy       # applies migrations, no prompts
npm test                    # must pass
npm run lint                # must pass

# Frontend
cd ../client
npm ci
npm run lint                # must pass (--max-warnings 0)
npm run build               # emits client/dist
```

`client/dist` is a static bundle. Serve it with any static file server, or
with the reverse proxy described below.

---

## 3. Running in production

### 3.1 Minimal (single process, personal use)

```bash
cd server
NODE_ENV=production \
DATABASE_URL="file:/var/lib/finance/finance.db" \
JWT_SECRET="<48+ random hex chars>" \
CLIENT_URL="https://finance.example.com" \
TRUST_PROXY=false \
PORT=3001 \
node src/index.js
```

Keep it alive with systemd:

```ini
# /etc/systemd/system/finance-api.service
[Unit]
Description=Personal Finance API
After=network.target

[Service]
Type=simple
User=finance
WorkingDirectory=/srv/finance/server
EnvironmentFile=/etc/finance/finance.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5

# The service only needs write access to its own data directory.
ProtectSystem=strict
ReadWritePaths=/var/lib/finance
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now finance-api
sudo systemctl status finance-api
```

### 3.2 With a reverse proxy (recommended)

Terminate TLS in front of both the API and the static bundle.

```nginx
server {
    listen 443 ssl http2;
    server_name finance.example.com;

    ssl_certificate     /etc/letsencrypt/live/finance.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/finance.example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Static SPA bundle
    root /srv/finance/client/dist;
    index index.html;

    # Client-side routing: unknown paths fall back to the SPA shell.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`X-Forwarded-For` must be set by **your** proxy only. Set `TRUST_PROXY=true`
in the service environment **only** when the API is reachable exclusively
through that proxy — otherwise a client can spoof its IP and defeat the
rate limiter.

### 3.3 Health check

```bash
curl --fail http://127.0.0.1:3001/api/health
# {"status":"ok","timestamp":"..."}
```

Suitable for a systemd `WatchdogSec` or a load-balancer health check.

---

## 4. Migrations

| Command | When |
|---------|------|
| `npm run prisma:migrate` | Local development — creates a new migration and applies it |
| `npm run prisma:deploy` | Production / CI — applies existing migrations, never prompts |

**Rules**

1. Migrations are applied **before** the new application version starts.
2. Never use `prisma migrate reset` against a database that holds real data.
3. Migrations that change data must be written so that a failed run leaves
   the database usable (see the minor-units migration, which rewrites tables
   inside a single transaction with `PRAGMA foreign_keys=OFF`).
4. Take a backup before applying migrations in production:
   ```bash
   npm run db:backup
   npm run prisma:deploy
   ```

Current migration list (9):

```
init → add_transfer_relation → phase5_savings_recurring
→ phase7_transfers_recurring → phase7_legacy_transfer_cleanup
→ phase8_report_history → phase9_notifications
→ convert_monetary_columns_to_minor_units → add_audit_events
```

---

## 5. Rollback

### 5.1 Application rollback (code only)

```bash
cd /srv/finance
git checkout <previous-tag>
cd server && npm ci && npm run prisma:generate
sudo systemctl restart finance-api
```

This is safe **only if the new release did not add a migration**. If it did,
see §5.2.

### 5.2 Rollback with a schema change

There is no automated down-migration. Use the restore procedure:

```bash
sudo systemctl stop finance-api
cd server
npm run db:restore -- --file prisma/backups/finance-backup-<before-upgrade>.db --yes
sudo systemctl start finance-api
```

This is why §4 rule 4 makes a pre-upgrade backup mandatory.

---

## 6. Observability

### Logs

The API emits **one JSON object per line** (`server/src/utils/logger.js`):

```json
{"level":"info","time":"2026-10-21T12:00:00.000Z","msg":"http_request","meta":{"method":"GET","path":"/api/transactions","status":200,"durationMs":12.4,"userId":"ckx...","ip":"::1"}}
```

- Request and response **bodies are never logged**.
- Passwords, tokens, JWTs, API keys, card numbers, UPI/IFSC identifiers and
  e-mail addresses are redacted before a message is written.
- `meta` is deep-redacted against a sensitive-key list.

Set `LOG_LEVEL=debug` for more detail; `info` is the production default.

### Audit trail

Security-relevant and money-moving operations are appended to the
`AuditEvent` table:

| Action | Recorded when |
|--------|---------------|
| `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILURE` | every login attempt |
| `AUTH_PASSWORD_CHANGE` | password changed |
| `TRANSACTION_CREATE` / `_UPDATE` / `_DELETE` | transaction lifecycle |
| `TRANSFER_CREATE` / `_UPDATE` / `_DELETE` | transfer lifecycle |
| `ACCOUNT_CREATE` / `_UPDATE` / `_DELETE` | account lifecycle |
| `EXPORT_CSV` / `EXPORT_PDF` | data export |

The trail is append-only and survives a data export/restore cycle.

### Error monitoring

Errors are logged with a stack trace in development only. In production the
stack is omitted and the client receives a generic `Internal server error`.

---

## 7. Incident response

### Suspected credential compromise

1. Ask the user to change their password (the API refuses the current one
   first, and the change is audit-logged).
2. Review the audit trail for that user: unexpected `TRANSACTION_*` or
   `EXPORT_*` events, logins from unfamiliar IPs.
3. If the JWT secret may be exposed, rotate `JWT_SECRET` and restart — this
   invalidates every issued token.

### Suspected data loss or corruption

Follow `docs/BACKUP_RECOVERY.md` §7 (Recovery runbook).

### Suspected abuse (rate-limit / bot activity)

- The API's own limits: 10 failed credential attempts per (IP, e-mail) per
  15 minutes; 5 registrations per IP per hour; 300 API requests per IP per
  minute.
- These are **per-process** limits. Behind more than one instance, configure
  a shared store in `server/src/middleware/security.js` before scaling out.
- Add a block at the proxy level if the pattern continues.

### Rate limits are too strict / too loose

All limits live in `server/src/middleware/security.js`. Changing them requires
a restart.

---

## 8. Dependency and secret scanning

```bash
# Vulnerable dependencies (server)
cd server && npm audit

# Vulnerable dependencies (client)
cd client && npm audit

# Secret scan — install once:  npm i -g gitleaks
gitleaks detect --source . --no-banner
```

`.env` files are git-ignored. `server/.env.example` contains a **placeholder**
secret that the server refuses to use in production — it is intentionally
invalid so it can never be deployed by accident.

---

## 9. CI checks

The commands CI must run (all currently pass locally):

```bash
cd server
npm ci
npm run prisma:generate
npm test
npm run lint

cd ../client
npm ci
npm run lint
npm run build
```

A pipeline that has not run these green should not deploy.

---

## 10. Production readiness checklist

### ✅ Done and verified (Phase 1)

- [x] Repository audited; findings and roadmap in `AUDIT_REPORT.md`
- [x] Monetary amounts stored as **integer minor units**; no binary
      floating-point in authoritative calculations
- [x] Migration from the old `Float` columns, applied and reversible via
      backup/restore
- [x] Automated test suite with an **isolated test database** (39 tests:
      money units, balance correctness, API money contract, security,
      user isolation)
- [x] Server `test` and `lint` scripts; client lint + production build
- [x] Rate limiting on register / login / password change, plus a global
      API ceiling
- [x] Security headers (CSP, HSTS in production, nosniff, frame-ancestors,
      referrer policy); framework version hidden
- [x] Placeholder/short JWT secrets rejected at start-up
- [x] Structured, redacted logging; request/response bodies never logged
- [x] Append-only audit trail for auth and money-moving operations
- [x] Validated backup + restore tooling with a tested round trip
- [x] Mobile navigation fixed (off-canvas drawer, Escape to close, inert
      when closed, scroll lock)
- [x] Demo seed data clearly labelled and reconciling with balances
- [x] Deployment, rollback, backup/recovery and incident-response docs

### ❌ NOT done — do not claim these

- [ ] **Multi-user business workspaces / RBAC** (Phase 4)
- [ ] **Double-entry bookkeeping, journal entries, posting rules** (Phase 5)
- [ ] **Invoices, bills, customers, suppliers, payment allocations** (Phase 4)
- [ ] **Real payment gateway integration** (Phase 6) — there is no payment
      processor wired up at all
- [ ] **Tax-compliant invoicing** — tax is not implemented; obtaining a
      professional review is a prerequisite before any such claim
- [ ] **Receipt / attachment storage** (Phase 3)
- [ ] **Automatic scheduled backups** — currently manual (§5 of the backup doc)
- [ ] **Encrypted backups** — the tool does not encrypt; use an encrypted
      volume or encrypt the file
- [ ] **Session revocation / token blacklist** — a rotated `JWT_SECRET`
      invalidates all tokens, but individual tokens cannot be revoked
- [ ] **CI workflow files** — the commands exist and pass, but no pipeline
      definition is committed yet
- [ ] **Android / local-first data boundary** (Phase 9)
- [ ] **Performance baselines** — not measured yet; do not quote numbers
- [ ] **Rate limiting across multiple instances** — in-memory only

### Production deployment recommendation

For the **intended personal, single-user deployment** the current state is
suitable once the checklist above is reviewed: the data model is exact, the
API is authenticated, rate-limited, header-hardened and audit-logged, and
backups are validated.

For a **multi-user business deployment**, do not deploy yet — Phase 4 and
Phase 5 (workspaces, RBAC, double-entry) are prerequisites, and the
in-memory rate limiter and single-file SQLite database must be replaced
first.
