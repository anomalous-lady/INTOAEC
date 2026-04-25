// src/models/Message.js
import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderType: {
      type: String,
      enum: ['user', 'system'],
      default: 'user',
    },
    content: {
      type: String,
      trim: true,
      maxlength: [10000, 'Message cannot exceed 10000 characters'],
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'audio', 'video', 'system', 'ai'],
      default: 'text',
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    reactions: [
      {
        emoji: { type: String, required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    // AI metadata
    aiGenerated: { type: Boolean, default: false },
    aiModel: { type: String, default: null },
    // Structured AI summary data (for voice call summaries)
    summaryData: {
      overallSummary: { type: String, default: null },
      actionItems: [{ type: String }],
      pricesQuoted: [{ type: String }],
      keyDates: [{ type: String }],
      callDuration: { type: Number, default: null }, // seconds
      callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', default: null },
    },
    // External (WhatsApp) metadata
    isExternal: { type: Boolean, default: false },
    externalId: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ isExternal: 1 });
messageSchema.index({ senderType: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
