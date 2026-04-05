// src/controllers/external.controller.js

import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { randomBytes } from 'crypto';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { AppError, catchAsync } from '../utils/AppError.js';
import logger from '../config/logger.js';
import { sendToWhatsApp, getMediaUrl, downloadMediaBuffer } from '../utils/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../', process.env.UPLOAD_PATH || 'uploads', 'files');

// ── Inbound: Meta webhook → save message  ─────────────────────────────────────
export const handleWebhook = catchAsync(async (req, res) => {
  logger.info('--- WEBHOOK HIT ---');
  logger.info(JSON.stringify(req.body, null, 2));
  const { entry } = req.body;

  if (!entry || !entry[0]?.changes?.[0]?.value?.messages) {
    logger.info('Webhook received but no messages found (likely a status update)');
    return res.status(200).send('OK');
  }

  const messageData = entry[0].changes[0].value.messages[0];
  const contactInfo = entry[0].changes[0].value.contacts?.[0];

  const waId = messageData.from;
  const messageId = messageData.id;
  const timestamp = new Date(parseInt(messageData.timestamp) * 1000);
  const contactName = contactInfo?.profile?.name || `WhatsApp ${waId}`;

  // ── Find or create external conversation ──────────────────────────────────
  let conversation = await Conversation.findOne({ type: 'external', externalId: waId });
  if (!conversation) {
    conversation = await Conversation.create({
      type: 'external',
      externalId: waId,
      name: contactName,
      isExternal: true,
    });
    logger.info(`Created new external conversation for ${waId} (${contactName})`);
  }

  // ── Find or create vendor user ────────────────────────────────────────────
  let vendorUser = await User.findOne({ username: waId });
  if (!vendorUser) {
    vendorUser = await User.create({
      username: waId,
      email: `${waId}@external.whatsapp`,
      password: randomBytes(16).toString('hex') + 'A1!',
      displayName: contactName,
      role: 'user',
      isActive: true,
      status: 'approved',
    });
    logger.info(`Provisioned vendor user: ${waId}`);
  }

  // ── Parse message content & media ─────────────────────────────────────────
  let messageContent = '';
  let messageType = 'text';
  let attachments = [];

  if (messageData.type === 'text') {
    messageContent = messageData.text.body;
  } else if (['image', 'audio', 'video', 'document'].includes(messageData.type)) {
    const mediaObj = messageData[messageData.type];
    const mediaResult = await downloadMedia(mediaObj.id, mediaObj.filename || null);
    if (mediaResult) {
      messageType = messageData.type === 'document' ? 'file' : messageData.type;
      attachments = [mediaResult];
      if (mediaObj.caption) messageContent = mediaObj.caption;
    }
  }

  // ── Persist message ───────────────────────────────────────────────────────
  const message = await Message.create({
    conversationId: conversation._id,
    sender: vendorUser._id,
    content: messageContent,
    messageType,
    attachments,
    isExternal: true,
    externalId: waId,
    createdAt: timestamp,
  });

  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: message._id,
    lastActivity: new Date(),
  });

  await message.populate('sender', 'username displayName avatar');

  // ── Emit to connected clients ─────────────────────────────────────────────
  const io = req.app.get('io');
  if (io) {
    io.emit('message:new', message.toJSON());
    io.to(`conversation:${conversation._id}`).emit('message:new', message.toJSON());
  }

  res.status(200).send('OK');
});

// ── Download media from Meta servers ──────────────────────────────────────────
async function downloadMedia(mediaId, originalName = null) {
  try {
    const mediaUrl = await getMediaUrl(mediaId);
    if (!mediaUrl) throw new Error('Could not resolve media URL');

    const { buffer, mimetype } = await downloadMediaBuffer(mediaUrl);

    const ext = mimetype === 'image/jpeg' ? '.jpg'
      : mimetype === 'image/png' ? '.png'
        : mimetype === 'image/webp' ? '.webp'
          : mimetype === 'audio/ogg' ? '.ogg'
            : mimetype === 'audio/mpeg' ? '.mp3'
              : mimetype === 'video/mp4' ? '.mp4'
                : '.bin';

    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    fs.writeFileSync(filepath, buffer);
    logger.info(`Downloaded media: ${filename} (${mimetype}, ${buffer.byteLength} bytes)`);

    return {
      filename,
      originalName: originalName || `external_${mediaId}`,
      mimetype,
      size: buffer.byteLength,
      url: `/uploads/files/${filename}`,
    };
  } catch (error) {
    logger.error(`Failed to download media: ${error.message}`);
    return null;
  }
}

// ── Webhook verification (GET) ────────────────────────────────────────────────
export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  logger.info(`[Webhook Verify] mode=${mode} token_match=${token === verifyToken}`);

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  res.status(403).send('Forbidden');
};

// ── Outbound: dedicated endpoint (kept for backward compat) ───────────────────
export const sendExternalMessage = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { content, messageType = 'text' } = req.body;

  const conversation = await Conversation.findById(conversationId);
  if (!conversation || conversation.type !== 'external') {
    return next(new AppError('External conversation not found.', 404));
  }

  const recipientId = conversation.externalId;
  const result = await sendToWhatsApp(recipientId, content, messageType);

  const message = await Message.create({
    conversationId: conversation._id,
    sender: req.user._id,
    content,
    messageType: messageType || 'text',
    isExternal: true,
    externalId: recipientId,
  });

  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: message._id,
    lastActivity: new Date(),
  });

  await message.populate('sender', 'username displayName avatar');

  // Emit to clients
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversation._id}`).emit('message:new', message.toJSON());
  }

  res.status(201).json({
    status: 'success',
    data: { message, whatsappMessageId: result.message_id },
  });
});

export default { handleWebhook, verifyWebhook, sendExternalMessage };