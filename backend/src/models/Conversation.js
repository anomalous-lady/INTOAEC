// src/models/Conversation.js
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['direct', 'group', 'ai', 'external'],
      default: 'direct',
    },
    externalId: { type: String, default: null },
    isExternal: { type: Boolean, default: false },
    vendorPhone: { type: String, default: null },
    vendorCompany: { type: String, default: null },
    vendorContact: { type: String, default: null },
    participants: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['member', 'admin'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
        lastRead: { type: Date, default: null },
        isMuted: { type: Boolean, default: false },
      },
    ],
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Conversation name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      maxlength: [300, 'Description cannot exceed 300 characters'],
    },
    avatar: {
      type: String,
      default: null,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // For direct conversations: prevent duplicate pairs
    directKey: {
      type: String,
      unique: true,
      sparse: true, // Only enforce uniqueness when field exists
    },
    // AI conversation settings
    aiSettings: {
      model: { type: String, default: 'gpt-4' },
      systemPrompt: { type: String, default: '' },
      temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        // SECURITY: strip all internal fields before any response
        // directKey is an internal deduplication key — never expose it
        // __v is Mongoose version key — noise for clients
        delete ret.__v;
        delete ret.directKey;
        return ret;
      },
    },
  }
);

conversationSchema.index({ 'participants.user': 1 });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ directKey: 1 }, { sparse: true });
conversationSchema.index({ isExternal: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
