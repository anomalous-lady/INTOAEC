// src/controllers/conversation.controller.js
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { AppError, catchAsync } from '../utils/AppError.js';

// ── Create / Get Direct Conversation ─────────────────────────────────────────
export const getOrCreateDirect = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  if (userId === req.user._id.toString()) {
    return next(new AppError('Cannot create a conversation with yourself.', 400));
  }

  const targetUser = await User.findById(userId);
  if (!targetUser || !targetUser.isActive) {
    return next(new AppError('User not found.', 404));
  }

  // Deterministic key so we never create duplicate direct conversations
  const ids = [req.user._id.toString(), userId].sort();
  const directKey = ids.join('_');

  let conversation = await Conversation.findOne({ directKey })
    .populate('participants.user', 'username displayName avatar isOnline lastSeen')
    .populate('lastMessage', 'content messageType sender createdAt isDeleted');

  if (!conversation) {
    conversation = await Conversation.create({
      type: 'direct',
      directKey,
      participants: [
        { user: req.user._id, role: 'member' },
        { user: userId, role: 'member' },
      ],
    });
    conversation = await conversation.populate('participants.user', 'username displayName avatar isOnline lastSeen');
  }

  res.status(200).json({ status: 'success', data: { conversation } });
});

// ── Create Group Conversation ─────────────────────────────────────────────────
export const createGroup = catchAsync(async (req, res, next) => {
  const { name, participantIds, description } = req.body;

  if (!participantIds || participantIds.length < 1) {
    return next(new AppError('A group needs at least one other participant.', 400));
  }

  // Validate all participants exist
  const uniqueIds = [...new Set(participantIds)].filter(
    (id) => id !== req.user._id.toString()
  );

  const users = await User.find({
    _id: { $in: uniqueIds },
    isActive: true,
  }).select('_id');

  if (users.length !== uniqueIds.length) {
    return next(new AppError('One or more users not found.', 404));
  }

  const participants = [
    { user: req.user._id, role: 'admin' },
    ...users.map((u) => ({ user: u._id, role: 'member' })),
  ];

  const conversation = await Conversation.create({
    type: 'group',
    name,
    description,
    participants,
  });

  await conversation.populate('participants.user', 'username displayName avatar isOnline');

  res.status(201).json({ status: 'success', data: { conversation } });
});

// ── Get My Conversations ──────────────────────────────────────────────────────
export const getMyConversations = catchAsync(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const conversations = await Conversation.find({
    'participants.user': req.user._id,
    isActive: true,
  })
    .sort({ lastActivity: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('participants.user', 'username displayName avatar isOnline lastSeen')
    .populate({
      path: 'lastMessage',
      select: 'content messageType sender createdAt isDeleted',
      populate: { path: 'sender', select: 'username displayName' },
    });

  // Attach unread count for each conversation
  const withUnread = await Promise.all(
    conversations.map(async (conv) => {
      const participant = conv.participants.find(
        (p) => p.user._id.toString() === req.user._id.toString()
      );
      const lastRead = participant?.lastRead || new Date(0);

      const unreadCount = await Message.countDocuments({
        conversationId: conv._id,
        createdAt: { $gt: lastRead },
        sender: { $ne: req.user._id },
        isDeleted: false,
      });

      return { ...conv.toJSON(), unreadCount };
    })
  );

  res.status(200).json({
    status: 'success',
    results: withUnread.length,
    data: { conversations: withUnread },
  });
});

// ── Get Single Conversation ───────────────────────────────────────────────────
export const getConversation = catchAsync(async (req, res, next) => {
  const conversation = await Conversation.findOne({
    _id: req.params.conversationId,
    'participants.user': req.user._id,
  }).populate('participants.user', 'username displayName avatar isOnline lastSeen');

  if (!conversation) return next(new AppError('Conversation not found.', 404));

  res.status(200).json({ status: 'success', data: { conversation } });
});

// ── Update Group ──────────────────────────────────────────────────────────────
export const updateGroup = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { name, description } = req.body;

  const conversation = await Conversation.findOne({
    _id: conversationId,
    type: 'group',
    participants: {
      $elemMatch: { user: req.user._id, role: 'admin' },
    },
  });

  if (!conversation) return next(new AppError('Group not found or insufficient permissions.', 404));

  if (name) conversation.name = name;
  if (description !== undefined) conversation.description = description;
  await conversation.save();

  res.status(200).json({ status: 'success', data: { conversation } });
});

// ── Add Participants ──────────────────────────────────────────────────────────
export const addParticipants = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { userIds } = req.body;

  const conversation = await Conversation.findOne({
    _id: conversationId,
    type: 'group',
    participants: { $elemMatch: { user: req.user._id, role: 'admin' } },
  });

  if (!conversation) return next(new AppError('Group not found or insufficient permissions.', 404));

  const existingIds = conversation.participants.map((p) => p.user.toString());
  const newIds = userIds.filter((id) => !existingIds.includes(id));

  const newUsers = await User.find({ _id: { $in: newIds }, isActive: true }).select('_id');
  newUsers.forEach((u) => conversation.participants.push({ user: u._id, role: 'member' }));

  await conversation.save();
  await conversation.populate('participants.user', 'username displayName avatar');

  res.status(200).json({ status: 'success', data: { conversation } });
});

// ── Leave Conversation ────────────────────────────────────────────────────────
export const leaveConversation = catchAsync(async (req, res, next) => {
  const conversation = await Conversation.findOne({
    _id: req.params.conversationId,
    'participants.user': req.user._id,
  });

  if (!conversation) return next(new AppError('Conversation not found.', 404));
  if (conversation.type === 'direct') return next(new AppError('Cannot leave a direct conversation.', 400));

  conversation.participants = conversation.participants.filter(
    (p) => p.user.toString() !== req.user._id.toString()
  );

  if (conversation.participants.length === 0) {
    conversation.isActive = false;
  } else {
    // Promote first member to admin if the leaving user was the only admin
    const hasAdmin = conversation.participants.some((p) => p.role === 'admin');
    if (!hasAdmin) conversation.participants[0].role = 'admin';
  }

  await conversation.save();

  res.status(200).json({ status: 'success', message: 'Left conversation.' });
});

// ── Mark Conversation as Read ─────────────────────────────────────────────────
export const markAsRead = catchAsync(async (req, res, next) => {
  await Conversation.updateOne(
    { _id: req.params.conversationId, 'participants.user': req.user._id },
    { $set: { 'participants.$.lastRead': new Date() } }
  );

  res.status(200).json({ status: 'success', message: 'Marked as read.' });
});
