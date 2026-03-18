// src/middleware/rateLimiter.js
// SECURITY NOTE: In production, replace the default in-memory store with a
// Redis store so limits survive server restarts and work across multiple instances:
//   npm install rate-limit-redis ioredis
//   import RedisStore from 'rate-limit-redis'
//   import Redis from 'ioredis'
//   const redisClient = new Redis(process.env.REDIS_URL)
//   store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) })
import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  // SECURITY: keyGenerator defaults to IP — good enough for most cases.
  // For proxied deployments (nginx, Cloudflare), set `app.set('trust proxy', 1)`
  // in app.js so req.ip reflects the real client IP, not the proxy IP.
  handler: (req, res, next) => {
    next(new AppError('Too many requests from this IP. Please try again later.', 429));
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * Strict limiter for auth endpoints (prevent brute force / credential stuffing)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  // SECURITY: skip on failed requests only — successful logins don't count toward limit
  skipSuccessfulRequests: true,
  handler: (req, res, next) => {
    next(new AppError('Too many auth attempts. Please wait 15 minutes.', 429));
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * Upload rate limiter — prevents upload flooding / storage exhaustion
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError('Too many upload requests. Please slow down.', 429));
  },
});
