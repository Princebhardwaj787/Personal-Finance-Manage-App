export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

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
  }

  if (err.name === 'PrismaClientValidationError') {
    console.error('Prisma Validation Error:', JSON.stringify(err, null, 2));
    return res.status(400).json({
      error: 'Invalid data provided',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
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