// src/controllers/call.controller.js
import { v4 as uuidv4 } from 'uuid';
import Call from '../models/Call.js';
import Conversation from '../models/Conversation.js';
import { AppError, catchAsync } from '../utils/AppError.js';

// ── Initiate Call ─────────────────────────────────────────────────────────────
export const initiateCall = catchAsync(async (req, res, next) => {
  const { conversationId, type = 'video' } = req.body;

  const conversation = await Conversation.findOne({
    _id: conversationId,
    'participants.user': req.user._id,
    isActive: true,
  });

  if (!conversation) return next(new AppError('Conversation not found.', 404));

  // Check for active call in this conversation
  const activeCall = await Call.findOne({
    conversationId,
    status: { $in: ['ringing', 'active'] },
  });

  if (activeCall) return next(new AppError('A call is already active in this conversation.', 409));

  const roomId = uuidv4();
  const participantIds = conversation.participants
    .map((p) => p.user.toString())
    .filter((id) => id !== req.user._id.toString());

  const call = await Call.create({
    roomId,
    conversationId,
    initiator: req.user._id,
    type,
    status: 'ringing',
    participants: [
      { user: req.user._id, status: 'joined' },
      ...participantIds.map((id) => ({ user: id, status: 'invited' })),
    ],
  });

  res.status(201).json({ status: 'success', data: { call } });
});

// ── Join Call ─────────────────────────────────────────────────────────────────
export const joinCall = catchAsync(async (req, res, next) => {
  const call = await Call.findOne({
    roomId: req.params.roomId,
    status: { $in: ['ringing', 'active'] },
    'participants.user': req.user._id,
  });

  if (!call) return next(new AppError('Call not found or already ended.', 404));

  const participant = call.participants.find((p) => p.user.toString() === req.user._id.toString());
  if (participant) {
    participant.status = 'joined';
    participant.joinedAt = new Date();
  }

  if (call.status === 'ringing') {
    call.status = 'active';
    call.startedAt = new Date();
  }

  await call.save();

  res.status(200).json({ status: 'success', data: { call } });
});

// ── End Call ──────────────────────────────────────────────────────────────────
export const endCall = catchAsync(async (req, res, next) => {
  const call = await Call.findOne({
    roomId: req.params.roomId,
    status: { $in: ['ringing', 'active'] },
  });

  if (!call) return next(new AppError('Call not found.', 404));

  const isParticipant = call.participants.some(
    (p) => p.user.toString() === req.user._id.toString()
  );
  if (!isParticipant) return next(new AppError('You are not a participant in this call.', 403));

  const now = new Date();
  call.status = 'ended';
  call.endedAt = now;
  call.endReason = req.body.reason || 'normal';

  if (call.startedAt) {
    call.duration = Math.floor((now - call.startedAt) / 1000);
  }

  // Mark all still-in participants as left
  call.participants.forEach((p) => {
    if (p.status === 'joined') {
      p.status = 'left';
      p.leftAt = now;
    }
  });

  await call.save();

  res.status(200).json({ status: 'success', data: { call } });
});

// ── Reject Call ───────────────────────────────────────────────────────────────
export const rejectCall = catchAsync(async (req, res, next) => {
  const call = await Call.findOne({
    roomId: req.params.roomId,
    status: 'ringing',
    'participants.user': req.user._id,
  });

  if (!call) return next(new AppError('Call not found.', 404));

  const participant = call.participants.find((p) => p.user.toString() === req.user._id.toString());
  if (participant) participant.status = 'rejected';

  // If all non-initiator participants rejected, mark call as rejected
  const nonInitiators = call.participants.filter(
    (p) => p.user.toString() !== call.initiator.toString()
  );
  const allRejected = nonInitiators.every((p) => p.status === 'rejected');
  if (allRejected) {
    call.status = 'rejected';
    call.endedAt = new Date();
    call.endReason = 'rejected';
  }

  await call.save();

  res.status(200).json({ status: 'success', message: 'Call rejected.' });
});

// ── Get Call History ──────────────────────────────────────────────────────────
export const getCallHistory = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  // SECURITY: explicit .select() before .lean() — lean() bypasses toJSON transform
  const calls = await Call.find({
    conversationId,
    'participants.user': req.user._id,
  })
    .select('roomId conversationId initiator participants type status startedAt endedAt duration createdAt')
    .sort({ createdAt: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit))
    .populate('initiator', 'username displayName avatar')
    .populate('participants.user', 'username displayName avatar')
    .lean();

  res.status(200).json({ status: 'success', results: calls.length, data: { calls } });
});

// ── Get Active Call ───────────────────────────────────────────────────────────
export const getActiveCall = catchAsync(async (req, res, next) => {
  const call = await Call.findOne({
    conversationId: req.params.conversationId,
    status: { $in: ['ringing', 'active'] },
  }).populate('participants.user', 'username displayName avatar');

  res.status(200).json({ status: 'success', data: { call: call || null } });
});
