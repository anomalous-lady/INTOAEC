// src/socket/socketAuth.js
import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/User.js';
import logger from '../config/logger.js';

/**
 * Socket.io authentication + authorization middleware.
 *
 * Two checks before any socket connection is accepted:
 *   1. Valid JWT (same as HTTP protect middleware)
 *   2. User is approved (status === 'approved') — enforces company-only access
 *      on the real-time layer, mirroring requireApproved on HTTP routes.
 *
 * A suspended user who still holds a valid JWT will be blocked here too,
 * because the suspend action sets status = 'suspended' in the DB.
 */
const socketAuth = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('AUTH_REQUIRED'));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return next(new Error('INVALID_TOKEN'));
    }

    const user = await User.findById(decoded.id)
      .select('_id username displayName avatar isActive status role');

    if (!user || !user.isActive) {
      return next(new Error('USER_NOT_FOUND'));
    }

    // SECURITY: block suspended users from connecting to real-time layer
    if (user.status === 'suspended') {
      return next(new Error('ACCOUNT_SUSPENDED'));
    }

    // SECURITY: block pending users — they haven't been approved yet
    if (user.status !== 'approved' && user.role !== 'admin') {
      return next(new Error('ACCOUNT_PENDING'));
    }

    socket.user = user;
    next();
  } catch (err) {
    logger.error(`Socket auth error: ${err.message}`);
    next(new Error('AUTH_FAILED'));
  }
};

export default socketAuth;
