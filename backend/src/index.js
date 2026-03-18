// src/index.js
import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocket } from './socket/index.js';
import logger from './config/logger.js';

// ── Unhandled rejections / exceptions ────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION — shutting down:', err);
  process.exit(1);
});

const PORT = parseInt(process.env.PORT) || 5000;

const start = async () => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Create HTTP server from Express app
  const server = http.createServer(app);

  // 3. Attach Socket.io (must happen before server.listen)
  const io = initSocket(server);

  // 4. Make io accessible in controllers if needed
  app.set('io', io);

  // 5. Start listening
  server.listen(PORT, () => {
    logger.info(`🚀 AEC Backend running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`📡 WebSocket ready`);
    logger.info(`🗄️  MongoDB connected`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — graceful shutdown`);

    server.close(async () => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10s if something hangs
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION — shutting down:', err);
    shutdown('UNHANDLED_REJECTION');
  });
};

start();
