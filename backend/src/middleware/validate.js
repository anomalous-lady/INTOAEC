// src/middleware/validate.js
import { validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.js';

/**
 * Runs after express-validator chains.
 * Collects all validation errors and returns a 400 if any exist.
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return next(new AppError(messages[0], 400)); // Return first error only (cleaner UX)
  }
  next();
};

export default validate;
