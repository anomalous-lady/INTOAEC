// src/models/Call.js
import mongoose from 'mongoose';

const callSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    initiator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    callerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    participants: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
        leftAt: { type: Date, default: null },
        status: {
          type: String,
          enum: ['invited', 'joined', 'left', 'rejected', 'missed'],
          default: 'invited',
        },
      },
    ],
    type: {
      type: String,
      enum: ['audio', 'video', 'pstn'],
      default: 'video',
    },
    status: {
      type: String,
      enum: ['ringing', 'active', 'ended', 'missed', 'rejected'],
      default: 'ringing',
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 }, // seconds
    // Plivo sends values like USER_HANGUP, NORMAL_CLEARING, CANCEL, etc.
    // We intentionally avoid a strict enum here to accept any Plivo HangupCause.
    endReason: {
      type: String,
      default: null,
    },
    // Plivo PSTN Fields
    plivoCallUuid: { type: String, default: null },
    recordingUrl: { type: String, default: null },
    transcript: { type: String, default: null },
    summary: { type: String, default: null },
    // Structured AI summary data
    summaryData: {
      overallSummary: { type: String, default: null },
      actionItems: [{ type: String }],
      pricesQuoted: [{ type: String }],
      keyDates: [{ type: String }],
    },
    aiStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', null],
      default: null,
    },
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

const Call = mongoose.model('Call', callSchema);
export default Call;
