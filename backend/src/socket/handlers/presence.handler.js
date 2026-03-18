// src/socket/handlers/presence.handler.js
import User from '../../models/User.js';
import logger from '../../config/logger.js';

/**
 * Tracks user online/offline presence.
 * Each user joins their own `user:<userId>` room so they can
 * receive direct signals (calls, notifications) across multiple devices/tabs.
 */
const registerPresenceHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  const goOnline = async () => {
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        socketId: socket.id,
        lastSeen: new Date(),
      });

      // Broadcast presence to all connections
      io.emit('user:online', {
        userId,
        user: {
          _id: userId,
          username: socket.user.username,
          displayName: socket.user.displayName,
          avatar: socket.user.avatar,
        },
      });

      logger.debug(`User online: ${userId} (${socket.id})`);
    } catch (err) {
      logger.error(`goOnline error: ${err.message}`);
    }
  };

  const goOffline = async () => {
    try {
      // Check if user has other active sockets before marking offline
      const socketsInRoom = await io.in(`user:${userId}`).fetchSockets();
      const otherSockets = socketsInRoom.filter((s) => s.id !== socket.id);

      if (otherSockets.length === 0) {
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          socketId: null,
          lastSeen: new Date(),
        });

        io.emit('user:offline', { userId, lastSeen: new Date() });
        logger.debug(`User offline: ${userId}`);
      }
    } catch (err) {
      logger.error(`goOffline error: ${err.message}`);
    }
  };

  // Join personal room for direct signals
  socket.join(`user:${userId}`);
  goOnline();

  // Handle disconnect
  socket.on('disconnect', goOffline);

  // Manual status update
  socket.on('presence:update', async ({ status }) => {
    const allowed = ['online', 'away', 'busy', 'offline'];
    if (!allowed.includes(status)) return;

    if (status === 'offline') {
      await goOffline();
    } else {
      await User.findByIdAndUpdate(userId, { isOnline: status !== 'offline' });
      io.emit('user:status', { userId, status });
    }
  });
};

export default registerPresenceHandlers;
