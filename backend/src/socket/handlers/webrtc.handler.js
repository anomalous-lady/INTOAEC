// src/socket/handlers/webrtc.handler.js
import mongoose from 'mongoose';
import Call from '../../models/Call.js';
import logger from '../../config/logger.js';

// SECURITY: Validate ObjectId format before any DB query
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// SECURITY: Per-socket ICE candidate flood guard
// ICE trickle can be legitimately rapid but 200/10s is a hard ceiling
const makeFloodGuard = (max, windowMs) => {
  let count = 0;
  let resetAt = Date.now() + windowMs;
  return () => {
    const now = Date.now();
    if (now > resetAt) { count = 0; resetAt = now + windowMs; }
    return ++count <= max;
  };
};

// SECURITY: UUID v4 format validation for roomId
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUUID = (id) => UUID_RE.test(id);

const registerWebRTCHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  const iceFloodGuard = makeFloodGuard(200, 10000); // 200 ICE candidates / 10s

  // ── Initiate call signal ──────────────────────────────────────────────────
  socket.on('webrtc:call-user', async ({ targetUserId, roomId, offer, callType = 'video' }, ack) => {
    try {
      if (!isValidUUID(roomId) || !isValidObjectId(targetUserId)) {
        return ack?.({ error: 'Invalid parameters' });
      }
      if (!['audio', 'video'].includes(callType)) {
        return ack?.({ error: 'Invalid call type' });
      }

      // SECURITY: verify caller actually initiated this call in the DB
      const call = await Call.findOne({ roomId, initiator: userId });
      if (!call) return ack?.({ error: 'Call not found or not authorized' });

      // SECURITY: verify targetUserId is actually a participant in this call,
      // not an arbitrary user the client has crafted
      const isParticipant = call.participants.some(
        (p) => p.user.toString() === targetUserId
      );
      if (!isParticipant) return ack?.({ error: 'Target is not a call participant' });

      io.to(`user:${targetUserId}`).emit('webrtc:incoming-call', {
        roomId,
        callType,
        offer,
        callId: call._id,
        caller: {
          _id: userId,
          username: socket.user.username,
          displayName: socket.user.displayName,
          avatar: socket.user.avatar,
        },
      });

      logger.debug(`WebRTC offer: ${userId} → ${targetUserId} room ${roomId}`);
      ack?.({ success: true });
    } catch (err) {
      logger.error(`webrtc:call-user error: ${err.message}`);
      ack?.({ error: 'Signaling failed' });
    }
  });

  // ── Answer call ───────────────────────────────────────────────────────────
  socket.on('webrtc:call-answer', async ({ callerId, roomId, answer }, ack) => {
    try {
      if (!isValidUUID(roomId) || !isValidObjectId(callerId)) {
        return ack?.({ error: 'Invalid parameters' });
      }

      // SECURITY: verify this call exists and the answerer is a participant
      const call = await Call.findOne({
        roomId,
        'participants.user': userId,
        status: { $in: ['ringing', 'active'] },
      });
      if (!call) return ack?.({ error: 'Call not found or already ended' });

      // SECURITY: verify callerId is the actual initiator, not spoofed
      if (call.initiator.toString() !== callerId) {
        return ack?.({ error: 'Invalid caller ID' });
      }

      io.to(`user:${callerId}`).emit('webrtc:call-answered', {
        roomId,
        answer,
        answeredBy: userId,
      });
      ack?.({ success: true });
    } catch (err) {
      logger.error(`webrtc:call-answer error: ${err.message}`);
      ack?.({ error: 'Signaling failed' });
    }
  });

  // ── ICE candidate exchange ────────────────────────────────────────────────
  socket.on('webrtc:ice-candidate', async ({ targetUserId, candidate, roomId }) => {
    // SECURITY: flood guard — ICE trickle is fast but shouldn't be infinite
    if (!iceFloodGuard()) return;

    if (!isValidUUID(roomId) || !isValidObjectId(targetUserId)) return;

    // SECURITY: verify both parties are in the same call before forwarding
    // This prevents a user from sending ICE noise to arbitrary user IDs
    const call = await Call.findOne({
      roomId,
      'participants.user': { $all: [userId, targetUserId] },
      status: { $in: ['ringing', 'active'] },
    }).lean().catch(() => null);

    if (!call) return; // Silently drop — don't tell attacker why

    io.to(`user:${targetUserId}`).emit('webrtc:ice-candidate', {
      candidate,
      fromUserId: userId,
      roomId,
    });
  });

  // ── End / hang up call ────────────────────────────────────────────────────
  socket.on('webrtc:end-call', async ({ roomId }, ack) => {
    try {
      if (!isValidUUID(roomId)) return ack?.({ error: 'Invalid room ID' });

      // SECURITY: fetch targetUserIds from DB, NOT from client payload
      // The original code accepted targetUserIds from the client — an attacker
      // could supply arbitrary userIds and send fake "call ended" signals
      const call = await Call.findOne({
        roomId,
        'participants.user': userId,
        status: { $in: ['ringing', 'active'] },
      });

      if (!call) return ack?.({ error: 'Call not found' });

      // Get real participant IDs from DB
      const participantIds = call.participants
        .map((p) => p.user.toString())
        .filter((id) => id !== userId);

      // Notify all legitimate participants
      participantIds.forEach((pid) => {
        io.to(`user:${pid}`).emit('webrtc:call-ended', { roomId, endedBy: userId });
      });

      // Notify the call room (for multi-party)
      io.to(`call:${roomId}`).emit('webrtc:call-ended', { roomId, endedBy: userId });

      ack?.({ success: true });
    } catch (err) {
      logger.error(`webrtc:end-call error: ${err.message}`);
      ack?.({ error: 'Failed to end call' });
    }
  });

  // ── Reject call ───────────────────────────────────────────────────────────
  socket.on('webrtc:reject-call', async ({ callerId, roomId }) => {
    try {
      if (!isValidUUID(roomId) || !isValidObjectId(callerId)) return;

      // SECURITY: verify this user is actually a participant before sending rejection
      const call = await Call.findOne({
        roomId,
        'participants.user': userId,
        initiator: callerId, // Verify callerId is the real initiator
        status: 'ringing',
      });

      if (!call) return; // Silently drop invalid rejections

      io.to(`user:${callerId}`).emit('webrtc:call-rejected', {
        roomId,
        rejectedBy: userId,
      });
    } catch (err) {
      logger.error(`webrtc:reject-call error: ${err.message}`);
    }
  });

  // ── Join WebRTC room ──────────────────────────────────────────────────────
  socket.on('webrtc:join-room', async ({ roomId }) => {
    try {
      if (!isValidUUID(roomId)) return;

      // SECURITY: verify user is a call participant before joining the room
      const call = await Call.findOne({
        roomId,
        'participants.user': userId,
        status: { $in: ['ringing', 'active'] },
      });

      if (!call) return; // Not a participant — don't join

      socket.join(`call:${roomId}`);
      socket.to(`call:${roomId}`).emit('webrtc:peer-joined', {
        userId,
        user: {
          _id: userId,
          username: socket.user.username,
          displayName: socket.user.displayName,
          avatar: socket.user.avatar,
        },
      });
    } catch (err) {
      logger.error(`webrtc:join-room error: ${err.message}`);
    }
  });

  socket.on('webrtc:leave-room', ({ roomId }) => {
    if (!isValidUUID(roomId)) return;
    socket.leave(`call:${roomId}`);
    socket.to(`call:${roomId}`).emit('webrtc:peer-left', { userId });
  });

  // ── Media state (mute / cam toggle) ──────────────────────────────────────
  socket.on('webrtc:media-state', ({ roomId, audio, video }) => {
    if (!isValidUUID(roomId)) return;
    // SECURITY: only broadcast if socket has joined this call room
    if (!socket.rooms.has(`call:${roomId}`)) return;

    // SECURITY: coerce to booleans — don't forward arbitrary client data
    socket.to(`call:${roomId}`).emit('webrtc:peer-media-state', {
      userId,
      audio: Boolean(audio),
      video: Boolean(video),
    });
  });
};

export default registerWebRTCHandlers;
