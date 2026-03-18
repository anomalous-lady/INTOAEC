// src/utils/AppError.js

/**
 * Operational error with HTTP status code.
 * Distinguished from programmer errors by isOperational flag.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wraps async route handlers to catch errors and pass to Express error middleware.
 * Eliminates try/catch boilerplate in every controller.
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default AppError;
