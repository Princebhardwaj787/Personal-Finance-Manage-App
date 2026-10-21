import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PORT',
  'CLIENT_URL'
];

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * In test mode we use a deterministic throwaway secret so the suite never
 * depends on a developer's local `.env` file. It is only ever valid while
 * NODE_ENV=test, and the server refuses to start with it otherwise.
 */
if (nodeEnv === 'test' && !process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-only-secret-not-used-outside-test-mode-0123456789';
}

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

/**
 * SECRET VALIDATION (Phase 1 §4)
 * ==============================
 * The committed `.env.example` ships a placeholder secret. A deployment that
 * copies it verbatim would sign every user's token with a publicly known key.
 * We refuse to start with a placeholder secret in production and warn loudly
 * in development so it can never reach a real deployment unnoticed.
 */

/** Secrets that must never be used to sign tokens. */
const FORBIDDEN_SECRETS = [
  'change-me-to-a-long-random-string',
  'change-me',
  'secret',
  'jwt-secret',
  'your-secret-here',
  'replace-me',
  'test-only-secret-not-used-outside-test-mode-0123456789'
];

/** Minimum acceptable length for a JWT signing key. */
const MIN_SECRET_LENGTH = 32;

const jwtSecret = String(process.env.JWT_SECRET).trim();

const isPlaceholder = FORBIDDEN_SECRETS.some(
  (forbidden) => jwtSecret.toLowerCase() === forbidden.toLowerCase()
);

if (isPlaceholder) {
  if (nodeEnv === 'production' || nodeEnv === 'test') {
    throw new Error(
      'JWT_SECRET is a known placeholder value. Generate a unique secret ' +
        '(e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`) ' +
        'before starting the server.'
    );
  }
  console.warn(
    '[config] WARNING: JWT_SECRET is a placeholder value. ' +
      'This is acceptable for local development ONLY. Generate a unique secret before deploying.'
  );
}

if (nodeEnv === 'production' && jwtSecret.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production.`
  );
}

if (nodeEnv !== 'test' && nodeEnv !== 'development' && jwtSecret.length < 16) {
  throw new Error('JWT_SECRET must be at least 16 characters.');
}

export const config = {
  database: {
    url: process.env.DATABASE_URL
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv
  },
  client: {
    url: process.env.CLIENT_URL
  },
  security: {
    // Trust proxy only when explicitly configured, otherwise a client could
    // spoof X-Forwarded-For and defeat the rate limiter.
    trustProxy: process.env.TRUST_PROXY === 'true',
    isProduction: nodeEnv === 'production'
  }
};
