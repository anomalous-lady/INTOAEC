// src/controllers/message.controller.js
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { AppError, catchAsync } from '../utils/AppError.js';
import { sendToWhatsApp } from '../utils/whatsapp.js';

// ── Helper: verify user is in conversation ────────────────────────────────────
const getConversationForUser = async (conversationId, userId) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    isActive: true,
  });

  if (!conversation) return null;

  // For external conversations, any authorized user can access (shared inbox)
  if (conversation.type === 'external') return conversation;

  // For other types, user must be a participant
  const isParticipant = conversation.participants.some(
    (p) => p.user.toString() === userId.toString()
  );

  return isParticipant ? conversation : null;
};

// ── Get Messages ──────────────────────────────────────────────────────────────
export const getMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { before, limit = 50 } = req.query;

  const conversation = await getConversationForUser(conversationId, req.user._id);
  if (!conversation) return next(new AppError('Conversation not found.', 404));

  const safeLimit = Math.min(parseInt(limit), 100);
  const query = { conversationId, isDeleted: false };
  if (before) query.createdAt = { $lt: new Date(before) };

  // SECURITY: explicit .select() before .lean() so toJSON transform is not needed
  const messages = await Message.find(query)
    .select('conversationId sender content messageType attachments replyTo readBy reactions isEdited editedAt isDeleted createdAt updatedAt')
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate('sender', 'username displayName avatar')
    .populate('replyTo', 'content sender messageType')
    .lean();

  // Return in chronological order
  messages.reverse();

  res.status(200).json({
    status: 'success',
    results: messages.length,
    data: { messages },
  });
});

// ── Send Message ──────────────────────────────────────────────────────────────
export const sendMessage = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { content, messageType = 'text', replyTo } = req.body;

  const conversation = await getConversationForUser(conversationId, req.user._id);
  if (!conversation) return next(new AppError('Conversation not found.', 404));

  if (!content && (!req.files || req.files.length === 0)) {
    return next(new AppError('Message must have content or attachments.', 400));
  }

  // Build attachments from uploaded files
  const attachments = (req.files || []).map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    url: `/uploads/files/${file.filename}`,
  }));

  const message = await Message.create({
    conversationId,
    sender: req.user._id,
    content: content?.trim(),
    messageType: attachments.length > 0 ? detectFileType(attachments[0].mimetype) : messageType,
    attachments,
    replyTo: replyTo || null,
    isExternal: conversation.type === 'external',
    externalId: conversation.type === 'external' ? conversation.externalId : null,
  });

  // If external conversation, send to WhatsApp
  if (conversation.type === 'external') {
    try {
      await sendToWhatsApp(conversation.externalId, content || '', message.messageType);
    } catch (err) {
      console.error('Failed to send to WhatsApp:', err.message);
      // We still save the message to our DB even if WhatsApp fails, 
      // but maybe we should flag it or tell the user?
    }
  }

  // Update conversation lastMessage and lastActivity
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: message._id,
    lastActivity: new Date(),
  });

  await message.populate('sender', 'username displayName avatar');

  // Emit via socket
  const io = req.app.get('io');
  if (io) {
    const broadcastPayload = message.toJSON();
    io.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);

    conversation.participants.forEach((p) => {
      const pid = p.user.toString();
      if (pid !== req.user._id.toString()) {
        io.to(`user:${pid}`).emit('notification:message', {
          conversationId,
          message: broadcastPayload,
        });
      }
    });
  }

  res.status(201).json({ status: 'success', data: { message } });
});

// ── Edit Message ──────────────────────────────────────────────────────────────
export const editMessage = catchAsync(async (req, res, next) => {
  const { messageId } = req.params;
  const { content } = req.body;

  const message = await Message.findOne({
    _id: messageId,
    sender: req.user._id,
    isDeleted: false,
  });

  if (!message) return next(new AppError('Message not found.', 404));
  if (message.messageType !== 'text') return next(new AppError('Only text messages can be edited.', 400));

  message.content = content.trim();
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  await message.populate('sender', 'username displayName avatar');

  res.status(200).json({ status: 'success', data: { message } });
});

// ── Delete Message ────────────────────────────────────────────────────────────
export const deleteMessage = catchAsync(async (req, res, next) => {
  const { messageId } = req.params;

  const message = await Message.findOne({ _id: messageId, isDeleted: false });
  if (!message) return next(new AppError('Message not found.', 404));

  // Allow sender or conversation admin to delete
  const isSender = message.sender.toString() === req.user._id.toString();
  const conversation = await Conversation.findOne({
    _id: message.conversationId,
    participants: { $elemMatch: { user: req.user._id, role: 'admin' } },
  });

  if (!isSender && !conversation) {
    return next(new AppError('You cannot delete this message.', 403));
  }

  // Soft delete — preserve for audit trail
  message.isDeleted = true;
  message.deletedAt = new Date();
  message.content = null;
  message.attachments = [];
  await message.save();

  res.status(200).json({ status: 'success', message: 'Message deleted.' });
});

// ── Add Reaction ──────────────────────────────────────────────────────────────
export const addReaction = catchAsync(async (req, res, next) => {
  const { messageId } = req.params;
  const { emoji } = req.body;

  const message = await Message.findById(messageId);
  if (!message || message.isDeleted) return next(new AppError('Message not found.', 404));

  // Remove existing reaction from this user (toggle)
  message.reactions = message.reactions.filter(
    (r) => r.user.toString() !== req.user._id.toString() || r.emoji !== emoji
  );

  // Check if user already reacted with same emoji (if so, above already removed it)
  const alreadyReacted = (await Message.findById(messageId)).reactions.some(
    (r) => r.user.toString() === req.user._id.toString() && r.emoji === emoji
  );

  if (!alreadyReacted) {
    message.reactions.push({ emoji, user: req.user._id });
  }

  await message.save();

  res.status(200).json({ status: 'success', data: { reactions: message.reactions } });
});

// ── Mark Messages Read ────────────────────────────────────────────────────────
export const markMessagesRead = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;

  await Message.updateMany(
    {
      conversationId,
      sender: { $ne: req.user._id },
      'readBy.user': { $ne: req.user._id },
      isDeleted: false,
    },
    { $push: { readBy: { user: req.user._id, readAt: new Date() } } }
  );

  await Conversation.updateOne(
    { _id: conversationId, 'participants.user': req.user._id },
    { $set: { 'participants.$.lastRead': new Date() } }
  );

  res.status(200).json({ status: 'success', message: 'Messages marked as read.' });
});

// ── Search Messages ───────────────────────────────────────────────────────────
export const searchMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { q, limit = 20 } = req.query;

  if (!q || q.trim().length < 2) return next(new AppError('Search query too short.', 400));

  const conversation = await getConversationForUser(conversationId, req.user._id);
  if (!conversation) return next(new AppError('Conversation not found.', 404));

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const messages = await Message.find({
    conversationId,
    content: regex,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit), 50))
    .select('conversationId sender content messageType attachments replyTo isEdited isDeleted createdAt')
    .populate('sender', 'username displayName avatar')
    .lean();

  res.status(200).json({ status: 'success', results: messages.length, data: { messages } });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const detectFileType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'file';
};
