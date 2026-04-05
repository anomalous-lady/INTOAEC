// src/socket/index.js
import { Server } from 'socket.io';
import socketAuth from './socketAuth.js';
import registerPresenceHandlers from './handlers/presence.handler.js';
import registerChatHandlers from './handlers/chat.handler.js';
import registerWebRTCHandlers from './handlers/webrtc.handler.js';
import logger from '../config/logger.js';

/**
 * Attaches Socket.io to the HTTP server and registers all event handlers.
 * Returns the io instance for use elsewhere (e.g., emitting from controllers).
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'development' 
        ? true // In development, allow any origin for easier LAN testing
        : (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map(u => u.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    // Limit payload size to prevent DoS
    maxHttpBufferSize: 5 * 1024 * 1024, // 5MB
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware ─────────────────────────────────────────────────────────
  io.use(socketAuth);

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`Socket connected: ${userId} (${socket.id})`);

    // Register all handler groups
    registerPresenceHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerWebRTCHandlers(io, socket);

    // Generic error handler per socket
    socket.on('error', (err) => {
      logger.error(`Socket error [${userId}]: ${err.message}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${userId} (${socket.id}) — reason: ${reason}`);
    });
  });

  // ── Metrics / monitoring ────────────────────────────────────────────────────
  setInterval(() => {
    const count = io.engine.clientsCount;
    if (count > 0) logger.debug(`Active socket connections: ${count}`);
  }, 60 * 1000);

  logger.info('Socket.io initialized');
  return io;
};

export default initSocket;
