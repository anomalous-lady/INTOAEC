// src/socket/handlers/chat.handler.js
import mongoose from 'mongoose';
import Message from '../../models/Message.js';
import Conversation from '../../models/Conversation.js';
import logger from '../../config/logger.js';

// ── SECURITY: Content sanitizer ───────────────────────────────────────────────
// Strip HTML tags and dangerous protocol strings from user content.
const sanitizeContent = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .trim()
    .slice(0, 5000);
};

// SECURITY: Validate ObjectId format before any DB query
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// SECURITY: Per-socket flood guard — prevents message/event flooding
const makeFloodGuard = (maxPerWindow = 30, windowMs = 10000) => {
  let count = 0;
  let resetAt = Date.now() + windowMs;
  return () => {
    const now = Date.now();
    if (now > resetAt) { count = 0; resetAt = now + windowMs; }
    return ++count <= maxPerWindow;
  };
};

const ALLOWED_MESSAGE_TYPES = new Set(['text', 'image', 'file', 'audio', 'video']);

const registerChatHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  const messageFloodGuard = makeFloodGuard(30, 10000);
  const typingFloodGuard  = makeFloodGuard(20, 5000);

  // ── Join conversation room ────────────────────────────────────────────────
  socket.on('conversation:join', async (conversationId) => {
    try {
      if (!isValidObjectId(conversationId)) {
        return socket.emit('error', { message: 'Invalid conversation ID' });
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true,
      });

      if (!conversation) {
        return socket.emit('error', { message: 'Conversation not found or access denied' });
      }

      socket.join(`conversation:${conversationId}`);
    } catch (err) {
      logger.error(`conversation:join error: ${err.message}`);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  });

  socket.on('conversation:leave', (conversationId) => {
    if (isValidObjectId(conversationId)) {
      socket.leave(`conversation:${conversationId}`);
    }
  });

  // ── Send message ──────────────────────────────────────────────────────────
  socket.on('message:send', async (data, ack) => {
    try {
      if (!messageFloodGuard()) {
        return ack?.({ error: 'Slow down — too many messages.' });
      }
      if (!data || typeof data !== 'object') {
        return ack?.({ error: 'Invalid payload' });
      }

      const { conversationId, content, messageType = 'text', replyTo, tempId } = data;

      if (!isValidObjectId(conversationId)) {
        return ack?.({ error: 'Invalid conversation ID' });
      }
      if (!ALLOWED_MESSAGE_TYPES.has(messageType)) {
        return ack?.({ error: 'Invalid message type' });
      }

      // SECURITY: sanitize before storing or broadcasting
      const safeContent = sanitizeContent(content);
      if (!safeContent && messageType === 'text') {
        return ack?.({ error: 'Message content is required' });
      }

      const safeReplyTo = replyTo && isValidObjectId(replyTo) ? replyTo : null;

      // Authorization — user must be a participant
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true,
      });

      if (!conversation) return ack?.({ error: 'Conversation not found' });

      const message = await Message.create({
        conversationId,
        sender: userId,
        content: safeContent,
        messageType,
        replyTo: safeReplyTo,
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        lastActivity: new Date(),
      });

      await message.populate('sender', 'username displayName avatar');
      await message.populate('replyTo', 'content sender messageType');

      const broadcastPayload = message.toJSON();

      // SECURITY: tempId is client-only correlation data — only returned to sender
      socket.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);
      socket.emit('message:new', { ...broadcastPayload, tempId });

      conversation.participants.forEach((p) => {
        const pid = p.user.toString();
        if (pid !== userId) {
          io.to(`user:${pid}`).emit('notification:message', {
            conversationId,
            message: broadcastPayload,
          });
        }
      });

      ack?.({ success: true, message: { ...broadcastPayload, tempId } });
    } catch (err) {
      logger.error(`message:send error: ${err.message}`);
      ack?.({ error: 'Failed to send message' });
    }
  });

  // ── Typing indicators ─────────────────────────────────────────────────────
  socket.on('typing:start', ({ conversationId }) => {
    if (!isValidObjectId(conversationId)) return;
    if (!typingFloodGuard()) return;
    // SECURITY: only broadcast if socket has actually joined this room
    if (!socket.rooms.has(`conversation:${conversationId}`)) return;

    socket.to(`conversation:${conversationId}`).emit('typing:start', {
      userId,
      user: {
        _id: userId,
        username: socket.user.username,
        displayName: socket.user.displayName,
      },
      conversationId,
    });
  });

  socket.on('typing:stop', ({ conversationId }) => {
    if (!isValidObjectId(conversationId)) return;
    if (!socket.rooms.has(`conversation:${conversationId}`)) return;

    socket.to(`conversation:${conversationId}`).emit('typing:stop', {
      userId,
      conversationId,
    });
  });

  // ── Read receipts ─────────────────────────────────────────────────────────
  socket.on('message:read', async ({ conversationId, messageIds }) => {
    try {
      if (!isValidObjectId(conversationId)) return;
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;
      if (messageIds.length > 100) return; // prevent bulk abuse

      const validIds = messageIds.filter(isValidObjectId);
      if (validIds.length === 0) return;

      await Message.updateMany(
        {
          _id: { $in: validIds },
          conversationId, // SECURITY: scope to conversation to prevent cross-conv reads
          'readBy.user': { $ne: userId },
          isDeleted: false,
        },
        { $push: { readBy: { user: userId, readAt: new Date() } } }
      );

      await Conversation.updateOne(
        { _id: conversationId, 'participants.user': userId },
        { $set: { 'participants.$.lastRead': new Date() } }
      );

      socket.to(`conversation:${conversationId}`).emit('message:read', {
        userId,
        conversationId,
        messageIds: validIds,
        readAt: new Date(),
      });
    } catch (err) {
      logger.error(`message:read error: ${err.message}`);
    }
  });

  // ── Message reaction ──────────────────────────────────────────────────────
  socket.on('message:react', async ({ messageId, emoji, conversationId }, ack) => {
    try {
      if (!isValidObjectId(messageId) || !isValidObjectId(conversationId)) {
        return ack?.({ error: 'Invalid ID' });
      }
      if (!socket.rooms.has(`conversation:${conversationId}`)) {
        return ack?.({ error: 'Not authorized for this conversation' });
      }
      // SECURITY: whitelist emoji length to prevent payload bloat
      if (typeof emoji !== 'string' || emoji.length > 10 || emoji.trim() === '') {
        return ack?.({ error: 'Invalid emoji' });
      }

      // SECURITY: include conversationId in query to prevent cross-conversation access
      const message = await Message.findOne({
        _id: messageId,
        conversationId,
        isDeleted: false,
      });

      if (!message) return ack?.({ error: 'Message not found' });

      const existingIdx = message.reactions.findIndex(
        (r) => r.user.toString() === userId && r.emoji === emoji
      );

      if (existingIdx !== -1) {
        message.reactions.splice(existingIdx, 1); // toggle off
      } else {
        if (message.reactions.length >= 500) {
          return ack?.({ error: 'Reaction limit reached' });
        }
        message.reactions.push({ emoji, user: userId });
      }

      await message.save();

      io.to(`conversation:${conversationId}`).emit('message:reaction', {
        messageId,
        reactions: message.reactions,
        conversationId,
      });

      ack?.({ success: true });
    } catch (err) {
      logger.error(`message:react error: ${err.message}`);
      ack?.({ error: 'Failed to react' });
    }
  });
};

export default registerChatHandlers;
