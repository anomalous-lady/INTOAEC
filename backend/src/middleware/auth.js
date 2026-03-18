// src/middleware/auth.js
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import User from '../models/User.js';

/**
 * protect — verifies JWT from Authorization header or cookie.
 * Attaches req.user on success.
 */
export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(new AppError('Authentication required. Please log in.', 401));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError('Session expired. Please refresh your token.', 401));
      }
      return next(new AppError('Invalid token. Please log in again.', 401));
    }

    if (decoded.type !== 'access') {
      return next(new AppError('Invalid token type.', 401));
    }

    const user = await User.findById(decoded.id).select('+passwordChangedAt');
    if (!user) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 403));
    }

    if (user.passwordChangedAfter(decoded.iat)) {
      return next(new AppError('Password recently changed. Please log in again.', 401));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * requireApproved — company-only gate.
 *
 * Every non-admin user must have status === 'approved' to access
 * conversations, contacts, chats, calls, and uploads.
 * Always apply AFTER protect.
 *
 * Admins bypass this check so they can manage pending users.
 */
export const requireApproved = (req, res, next) => {
  // Admins are always allowed through
  if (req.user.role === 'admin') return next();

  if (req.user.status !== 'approved') {
    // SECURITY: return 403, not 401 — the user IS authenticated, just not approved.
    // Don't reveal details about internal status values.
    return next(
      new AppError(
        'Your account is pending approval. Contact your administrator to gain access.',
        403
      )
    );
  }
  next();
};

/**
 * restrictTo — role-based access control.
 * Usage: restrictTo('admin', 'moderator')
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

/**
 * optionalAuth — attaches user if token present, continues if not.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) return next();

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    if (user?.isActive) req.user = user;
  } catch {
    // Silently fail — optional auth
  }
  next();
};
