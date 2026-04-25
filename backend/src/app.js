// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import path from 'path';
import { fileURLToPath } from 'url';

import { apiLimiter } from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';
import { AppError } from './utils/AppError.js';
import logger from './config/logger.js';
import { requestId, detectAbuse, slowRequestLogger } from './middleware/security.js';

// ── Route imports ─────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import messageRoutes from './routes/message.routes.js';
import callRoutes from './routes/call.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import adminRoutes from './routes/admin.routes.js';
import externalRoutes from './routes/external.routes.js';
import voiceRoutes from './routes/voice.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Request tracing + slow request detection ──────────────────────────────────
app.use(requestId);
app.use(slowRequestLogger);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  })
);

// ── Trust proxy (required for correct IP in rate limiter behind nginx/Cloudflare)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// SECURITY: strict origin allowlist — null/missing origin is REJECTED.
const ALLOWED_ORIGINS = new Set(
  (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map((u) => u.trim())
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (process.env.NODE_ENV === 'development') return callback(null, true); // Allow any origin for easy LAN dev testing
      if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Request-ID'],
  })
);

// ── Request parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// ── Security middleware ───────────────────────────────────────────────────────
app.use(mongoSanitize());  // Strip $, . from inputs (NoSQL injection)
app.use(detectAbuse);      // Block $where, $expr, prototype pollution
app.use(hpp());            // HTTP parameter pollution

// ── Compression ───────────────────────────────────────────────────────────────
app.use(compression());

// ── Request logging ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (req) => req.url === '/health',
    })
  );
}

// ── Static file serving — uploads ────────────────────────────────────────────
// SECURITY: helmet's crossOriginResourcePolicy is set to 'cross-origin' above
// so the Next.js frontend can load avatars/files. The /uploads path is public
// but all filenames are UUIDs so they cannot be enumerated.
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'), {
    maxAge: '1d',
    etag: true,
    // SECURITY: prevent directory listing
    index: false,
  })
);

// ── Health check ──────────────────────────────────────────────────────────────
// SECURITY: minimal response — no version, env, uptime, or any fingerprinting data
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/conversations/:conversationId/messages', messageRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/uploads', uploadRoutes);
// Admin routes: all protected by protect + restrictTo('admin') inside the router
app.use('/api/admin', adminRoutes);
// External (WhatsApp) webhook - NO rate limiting for webhooks
app.use('/api/external', externalRoutes);
app.use('/api/voice', voiceRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found.`, 404));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
