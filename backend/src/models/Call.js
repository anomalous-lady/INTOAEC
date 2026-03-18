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
      required: true,
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
      enum: ['audio', 'video'],
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
    endReason: {
      type: String,
      enum: ['normal', 'missed', 'rejected', 'network_error', 'timeout'],
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
