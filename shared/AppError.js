/**
 * APP ERROR (shared domain)
 * =========================
 * A framework-free error carrying an HTTP status code.
 *
 * It lives in `shared/` because the shared date-range rules throw it, and
 * those rules are used by BOTH the Express server and the Android client.
 * Keeping the class dependency-free means the client bundle never pulls in
 * the server's error handler (and therefore never pulls in `process.env`).
 *
 * The server re-exports it from `src/middleware/errorHandler.js` so every
 * existing `import { AppError } from '../middleware/errorHandler.js'` keeps
 * working unchanged.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

export default AppError;
