import { prisma } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * AUDIT SERVICE (Phase 1 §4)
 * ===========================
 * Append-only trail of security-relevant and money-moving operations.
 *
 * Design rules:
 *  - `record()` NEVER throws. A failed audit write must never break the
 *    operation the user actually asked for; it is logged instead.
 *  - Metadata is a JSON string (SQLite has no JSON type in Prisma) and must
 *    never contain secrets or full financial records.
 *  - The user id is taken from the authenticated request, never from a body.
 */

export const AUDIT_ACTIONS = Object.freeze({
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILURE: 'AUTH_LOGIN_FAILURE',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_PASSWORD_CHANGE: 'AUTH_PASSWORD_CHANGE',
  ACCOUNT_CREATE: 'ACCOUNT_CREATE',
  ACCOUNT_UPDATE: 'ACCOUNT_UPDATE',
  ACCOUNT_DELETE: 'ACCOUNT_DELETE',
  TRANSACTION_CREATE: 'TRANSACTION_CREATE',
  TRANSACTION_UPDATE: 'TRANSACTION_UPDATE',
  TRANSACTION_DELETE: 'TRANSACTION_DELETE',
  TRANSFER_CREATE: 'TRANSFER_CREATE',
  TRANSFER_UPDATE: 'TRANSFER_UPDATE',
  TRANSFER_DELETE: 'TRANSFER_DELETE',
  EXPORT_CSV: 'EXPORT_CSV',
  EXPORT_PDF: 'EXPORT_PDF'
});

export const AUDIT_OUTCOMES = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE'
});

export const AUDIT_SOURCES = Object.freeze({
  API: 'API',
  SCHEDULER: 'SCHEDULER',
  SYSTEM: 'SYSTEM'
});

/** Keys that must never be written into audit metadata. */
const FORBIDDEN_METADATA_KEYS = [
  'password',
  'passwordhash',
  'token',
  'secret',
  'authorization',
  'cookie',
  'jwt',
  'cardnumber',
  'cvv',
  'cvc',
  'pan',
  'accountnumber',
  'ifsc'
];

const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return null;

  const output = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_METADATA_KEYS.some((pattern) => normalized.includes(pattern))) continue;
    output[key] = value;
  }
  return JSON.stringify(output);
};

/**
 * Append one audit event.
 *
 * @param {object} event
 * @param {string} [event.userId]   the authenticated user (null for failures)
 * @param {string} event.action     one of AUDIT_ACTIONS
 * @param {string} [event.outcome]  SUCCESS | FAILURE
 * @param {string} [event.source]   API | SCHEDULER | SYSTEM
 * @param {string} [event.route]    HTTP method + route (no query values)
 * @param {string} [event.ip]       caller IP
 * @param {object} [event.metadata] non-sensitive context
 */
export const record = async (event) => {
  try {
    await prisma.auditEvent.create({
      data: {
        userId: event.userId ?? null,
        action: event.action,
        outcome: event.outcome ?? AUDIT_OUTCOMES.SUCCESS,
        source: event.source ?? AUDIT_SOURCES.API,
        route: event.route ?? null,
        ip: event.ip ?? null,
        metadata: sanitizeMetadata(event.metadata)
      }
    });
  } catch (error) {
    // An audit write must never break the user's operation.
    logger.error('audit_write_failed', {
      action: event.action,
      userId: event.userId ?? null,
      message: error?.message
    });
  }
};

/** Convenience helper that pulls user/ip/route straight off the request. */
export const recordFromRequest = async (req, action, extra = {}) => {
  await record({
    userId: req.user?.id ?? extra.userId ?? null,
    action,
    outcome: extra.outcome ?? AUDIT_OUTCOMES.SUCCESS,
    source: extra.source ?? AUDIT_SOURCES.API,
    route: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`.slice(0, 200),
    ip: req.ip,
    metadata: extra.metadata
  });
};

/** Paginated audit trail for one user (newest first). */
export const listForUser = async (userId, { page = 1, limit = 50 } = {}) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const skip = (safePage - 1) * safeLimit;

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: safeLimit
    }),
    prisma.auditEvent.count({ where: { userId } })
  ]);

  return {
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      outcome: event.outcome,
      source: event.source,
      route: event.route,
      ip: event.ip,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
      createdAt: event.createdAt
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    }
  };
};
