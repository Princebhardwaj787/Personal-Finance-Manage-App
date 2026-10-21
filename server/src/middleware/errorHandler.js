import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, _next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Log the failure with a redacted, structured payload. The stack is only
  // attached in development — never in production.
  logger.error('unhandled_error', {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    userId: req.user?.id ?? null,
    name: err?.name,
    code: err?.code,
    statusCode: err?.statusCode ?? 500,
    message: err?.message,
    stack: isProduction ? undefined : err?.stack
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors
    });
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0] || 'field';
      return res.status(409).json({
        error: `${field} already exists`
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Record not found'
      });
    }
    if (err.code === 'P2003') {
      // Foreign key constraint — a referenced record is missing or foreign.
      return res.status(400).json({
        error: 'Referenced record does not exist'
      });
    }
  }

  if (err.name === 'PrismaClientValidationError') {
    logger.error('prisma_validation_error', { details: err.message });
    return res.status(400).json({
      error: 'Invalid data provided',
      details: isProduction ? undefined : err.message
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // 5xx messages are internal details — never leak them to the client.
  const safeMessage = statusCode >= 500 && isProduction
    ? 'Internal server error'
    : message;

  res.status(statusCode).json({
    error: safeMessage,
    ...(!isProduction && err.stack ? { stack: err.stack } : {})
  });
};

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

export const notFound = (req, res) => {
  res.status(404).json({ error: 'Route not found' });
};
