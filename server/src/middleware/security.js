/**
 * SECURITY MIDDLEWARE (Phase 1 §4)
 * =================================
 * Three concerns, kept in one place so the security posture of the API is
 * easy to review in a single file:
 *
 *   1. `securityHeaders`  — standard HTTP hardening (CSP, HSTS, no-sniff,
 *                           clickjacking, referrer policy, permissions policy).
 *   2. `authRateLimiter`   — brute-force protection for the credential
 *                           endpoints (register / login / password change).
 *   3. `apiRateLimiter`    — a generous global ceiling so a single client
 *                           cannot flood the database.
 *
 * Notes:
 *  - Rate limiting is per-process (in-memory). That is correct for the
 *    current single-process + SQLite deployment. A multi-instance deployment
 *    must swap in a shared store (e.g. the Redis store of express-rate-limit)
 *    BEFORE it scales horizontally — see docs/BACKUP_RECOVERY.md.
 *  - The auth limiter keys on IP + the submitted email so one attacker
 *    cannot lock out every user, while a distributed attack on a single
 *    account is still throttled.
 */

import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/* ------------------------------------------------------------------ */
/* 1. Security headers                                                 */
/* ------------------------------------------------------------------ */
export const securityHeaders = (config = {}) => {
  // The config object is `{ server: { nodeEnv, ... }, client: { url }, ... }`.
  const nodeEnv = config.server?.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const clientUrl = config.client?.url;
  const isDev = nodeEnv === 'development';

  return helmet({
    // Content Security Policy. The SPA ships as bundled JS/CSS files, so
    // 'self' is enough in production. Vite's dev server needs inline
    // scripts and eval for HMR, so those are only allowed in development.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isDev ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'"],
        // React sets inline styles (e.g. Recharts) -> 'unsafe-inline' for style-src.
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Charts and icons can be inlined as data URIs.
        imgSrc: ["'self'", 'data:', 'blob:'],
        // The SPA talks only to its own origin through the API proxy.
        connectSrc: isDev ? ["'self'", clientUrl].filter(Boolean) : ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isDev ? null : []
      }
    },
    // Only advertise HSTS when the app is actually served over HTTPS.
    hsts: nodeEnv === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    // Do not leak the framework/version.
    hidePoweredBy: true,
    // Cross-origin resource policy: the API serves JSON only.
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' }
  });
};

/* ------------------------------------------------------------------ */
/* 2. Brute-force protection for credential endpoints                  */
/* ------------------------------------------------------------------ */

/**
 * Key generator: IP + normalised email.
 *
 * Keying on both means:
 *  - one attacker hammering many accounts is throttled per IP;
 *  - a distributed attack on a single account is throttled per account;
 *  - a false positive on one email does not lock out other users.
 *
 * `ipKeyGenerator` is used (not the raw `req.ip`) so IPv6 addresses are
 * normalised to a /64 subnet — otherwise a single IPv6 user could rotate
 * through an effectively unlimited number of addresses.
 */
const credentialKey = (req) => {
  const ip = ipKeyGenerator(req.ip || req.connection?.remoteAddress || 'unknown');
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  return `${ip}|${email}`;
};

const authLimiterOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 attempts per window per (ip, email)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: credentialKey,
  // Successful logins must not count against the budget.
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many attempts. Please wait a few minutes and try again.'
  }
};

/** Strict limiter for register / login / password change. */
export const authRateLimiter = rateLimit(authLimiterOptions);

/** Very strict limiter for registration only (prevents mass account creation). */
export const registerRateLimiter = rateLimit({
  ...authLimiterOptions,
  limit: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  skipSuccessfulRequests: false,
  message: {
    error: 'Too many accounts created from this device. Please try again later.'
  }
});

/* ------------------------------------------------------------------ */
/* 3. Global API ceiling                                               */
/* ------------------------------------------------------------------ */

/**
 * A generous global limit. It exists to stop a runaway client or script
 * from saturating the database, not to restrict normal interactive use.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 300, // 300 requests per minute per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Health checks and CSV/PDF exports are long-running; exclude them so a
  // slow export is never counted as abuse.
  skip: (req) => req.path === '/health' || req.path.startsWith('/reports/export'),
  message: {
    error: 'Too many requests. Please slow down.'
  }
});
