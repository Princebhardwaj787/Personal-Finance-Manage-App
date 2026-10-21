/**
 * REQUEST LOGGING (Phase 1 §4)
 * =============================
 * Replaces morgan's `dev` format with a structured, redacted request log.
 *
 * - One JSON object per request line, so log aggregation works without
 *   extra tooling.
 * - Query strings are logged (they carry filters, not secrets) but the
 *   logger masks anything that looks like a credential.
 * - Request/response bodies are NEVER logged: they contain financial data.
 * - The authenticated user id is recorded (never the token) so suspicious
 *   activity can be traced to an account.
 */

import { logger } from '../utils/logger.js';

/** Paths that are noisy and not useful in an audit trail. */
const QUIET_PATHS = new Set(['/api/health', '/favicon.ico']);

const requestLogger = () => (req, res, next) => {
  if (QUIET_PATHS.has(req.path)) return next();

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info('http_request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      // The user id comes from the JWT, never from a body or query param.
      userId: req.user?.id ?? null,
      ip: req.ip
    });
  });

  next();
};

export { requestLogger };
