// src/middleware/security.js
// ─────────────────────────────────────────────────────────────────────────────
//  Extra security hardening layered on top of Helmet + mongoSanitize + HPP.
//  Import and apply in app.js with: app.use(requestId); app.use(detectAbuse);
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'crypto';
import logger from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

// ── Request ID ───────────────────────────────────────────────────────────────
// Attach a unique ID to every request so log lines from the same request
// can be correlated across middleware and controllers.
export const requestId = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// ── Suspicious payload detector ───────────────────────────────────────────────
// A second line of defence against NoSQL injection and prototype pollution,
// independent of express-mongo-sanitize. Rejects requests whose body or
// query string contains operator patterns that should never appear in
// legitimate API payloads.
const DANGEROUS_PATTERNS = [
  /\$where/i,          // MongoDB JS execution
  /\$expr/i,           // MongoDB expression operator
  /\$function/i,       // MongoDB JS function
  /__proto__/,         // Prototype pollution
  /constructor\s*\[/,  // Prototype pollution via constructor
  /prototype\s*\[/,    // Prototype pollution via prototype
];

const containsDangerousPattern = (obj, depth = 0) => {
  if (depth > 10) return false; // Prevent infinite recursion on circular refs
  if (typeof obj === 'string') {
    return DANGEROUS_PATTERNS.some((re) => re.test(obj));
  }
  if (Array.isArray(obj)) {
    return obj.some((item) => containsDangerousPattern(item, depth + 1));
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).some(
      ([key, val]) =>
        DANGEROUS_PATTERNS.some((re) => re.test(key)) ||
        containsDangerousPattern(val, depth + 1)
    );
  }
  return false;
};

export const detectAbuse = (req, res, next) => {
  if (containsDangerousPattern(req.body) || containsDangerousPattern(req.query)) {
    logger.warn(`Suspicious payload blocked [rid:${req.id}] [ip:${req.ip}] [path:${req.path}]`);
    return next(new AppError('Invalid request.', 400));
  }
  next();
};

// ── Log slow requests ─────────────────────────────────────────────────────────
// Requests taking over 3s indicate either a DB problem or a potential
// slow-loris / algorithmic complexity attack.
export const slowRequestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 3000) {
      logger.warn(`Slow request [rid:${req.id}] ${req.method} ${req.path} took ${ms}ms`);
    }
  });
  next();
};
