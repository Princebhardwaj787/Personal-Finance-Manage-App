/**
 * LOG REDACTION (Phase 1 §4)
 * ==========================
 * Financial data and credentials must never end up in logs. This module
 * provides:
 *   - `redact()` — deep-clone an object, masking sensitive fields.
 *   - `redactText()` — mask secrets that appear inside free text (URLs,
 *     bearer tokens, e-mail addresses).
 *   - `createLogger()` — a small structured logger that emits one JSON
 *     object per line, so log aggregation works without extra tooling.
 *
 * Redacted keys (case-insensitive, matched as substrings):
 *   password, passwordhash, token, accessToken, refreshToken, secret,
 *   authorization, cookie, set-cookie, jwt, apikey, api_key, card,
 *   cvv, cvc, pan, accountnumber, ifsc, upi, dbpassword, connectionstring
 */

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'cookie',
  'jwt',
  'apikey',
  'api_key',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'pan',
  'accountnumber',
  'account_number',
  'ifsc',
  'upiid',
  'dbpassword',
  'connectionstring',
  'privatekey',
  'private_key'
];

const REDACTED = '[REDACTED]';

const isSensitiveKey = (key) => {
  const normalized = String(key).toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
};

/**
 * Deep-clone an object with sensitive values masked.
 * Cycles are handled (a seen-set prevents infinite recursion).
 */
export const redact = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redact(item, seen);
  }
  return output;
};

/** Mask secrets embedded in free text (bearer tokens, emails, long hex). */
export const redactText = (text) => {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text
    // `Authorization: Bearer <token>` / `Bearer <token>`
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    // JWT-shaped tokens (three base64url segments)
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[REDACTED]')
    // Common secret parameters in a query string or bare `key=value` text.
    // Matches at the start of the string, after `?`, `&`, whitespace or `;`.
    .replace(
      /(^|[?&;\s])((?:token|api[_-]?key|secret|password|passwd|pwd|access[_-]?token|refresh[_-]?token|code)=)[^&\s"']+/gi,
      `$1$2${REDACTED}`
    )
    // E-mail addresses (PII)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    // Long hex/base64 secrets
    .replace(/\b[0-9a-fA-F]{32,}\b/g, REDACTED);
};

/**
 * Minimal structured logger.
 *
 * Emits one JSON object per line:
 *   { "level": "info", "msg": "...", "time": "...", ...fields }
 *
 * `meta` is always redacted before it is written.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

export const createLogger = ({ level = process.env.LOG_LEVEL || 'info' } = {}) => {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const write = (levelName, message, meta) => {
    if ((LEVELS[levelName] ?? 99) > threshold) return;
    const entry = {
      level: levelName,
      time: new Date().toISOString(),
      msg: redactText(String(message))
    };
    if (meta && Object.keys(meta).length > 0) {
      entry.meta = redact(meta);
    }
    // eslint-disable-next-line no-console
    console[levelName === 'debug' ? 'log' : levelName](JSON.stringify(entry));
  };

  return {
    error: (message, meta) => write('error', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    info: (message, meta) => write('info', message, meta),
    debug: (message, meta) => write('debug', message, meta)
  };
};

export const logger = createLogger();

export { REDACTED };
