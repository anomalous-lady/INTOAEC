// src/lib/socket.ts
// ─────────────────────────────────────────────────────────────────────────────
//  Drop this file into your Next.js frontend at: src/lib/socket.ts
//  Single socket instance shared across the app.
//  Usage:
//    import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket'
// ─────────────────────────────────────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';
import type { Message, User } from './api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';

// ── Event type map ─────────────────────────────────────────────────────────────
export interface ServerToClientEvents {
  // Messages
  'message:new': (message: Message & { tempId?: string }) => void;
  'message:read': (data: { userId: string; conversationId: string; messageIds: string[]; readAt: string }) => void;
  'message:reaction': (data: { messageId: string; reactions: { emoji: string; user: string }[]; conversationId: string }) => void;

  // Typing
  'typing:start': (data: { userId: string; user: Pick<User, '_id' | 'username' | 'displayName'>; conversationId: string }) => void;
  'typing:stop': (data: { userId: string; conversationId: string }) => void;

  // Presence
  'user:online': (data: { userId: string; user: Pick<User, '_id' | 'username' | 'displayName' | 'avatar'> }) => void;
  'user:offline': (data: { userId: string; lastSeen: string }) => void;
  'user:status': (data: { userId: string; status: string }) => void;

  // Notifications
  'notification:message': (data: { conversationId: string; message: Message }) => void;

  // WebRTC
  'webrtc:incoming-call': (data: {
    roomId: string;
    callType: 'audio' | 'video';
    offer: RTCSessionDescriptionInit;
    callId: string;
    caller: Pick<User, '_id' | 'username' | 'displayName' | 'avatar'>;
  }) => void;
  'webrtc:call-answered': (data: { roomId: string; answer: RTCSessionDescriptionInit; answeredBy: string }) => void;
  'webrtc:ice-candidate': (data: { candidate: RTCIceCandidateInit; fromUserId: string; roomId: string }) => void;
  'webrtc:call-ended': (data: { roomId: string; endedBy: string }) => void;
  'webrtc:call-rejected': (data: { roomId: string; rejectedBy: string }) => void;
  'webrtc:peer-joined': (data: { userId: string; user: Pick<User, '_id' | 'username' | 'displayName' | 'avatar'> }) => void;
  'webrtc:peer-left': (data: { userId: string }) => void;
  'webrtc:peer-media-state': (data: { userId: string; audio: boolean; video: boolean }) => void;

  // Errors
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;

  'message:send': (
    data: { conversationId: string; content: string; messageType?: string; replyTo?: string; tempId?: string },
    ack?: (res: { success?: boolean; message?: Message; error?: string }) => void
  ) => void;
  'message:read': (data: { conversationId: string; messageIds: string[] }) => void;
  'message:react': (
    data: { messageId: string; emoji: string; conversationId: string },
    ack?: (res: { success?: boolean; error?: string }) => void
  ) => void;

  'typing:start': (data: { conversationId: string }) => void;
  'typing:stop': (data: { conversationId: string }) => void;

  'presence:update': (data: { status: 'online' | 'away' | 'busy' | 'offline' }) => void;

  'webrtc:call-user': (
    data: { targetUserId: string; roomId: string; offer: RTCSessionDescriptionInit; callType?: 'audio' | 'video' },
    ack?: (res: { success?: boolean; error?: string }) => void
  ) => void;
  'webrtc:call-answer': (data: { callerId: string; roomId: string; answer: RTCSessionDescriptionInit }) => void;
  'webrtc:ice-candidate': (data: { targetUserId: string; candidate: RTCIceCandidateInit; roomId: string }) => void;
  'webrtc:end-call': (data: { roomId: string; targetUserIds?: string[] }) => void;
  'webrtc:reject-call': (data: { callerId: string; roomId: string }) => void;
  'webrtc:join-room': (data: { roomId: string }) => void;
  'webrtc:leave-room': (data: { roomId: string }) => void;
  'webrtc:media-state': (data: { roomId: string; audio: boolean; video: boolean }) => void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ── Singleton socket instance ─────────────────────────────────────────────────
let socket: TypedSocket | null = null;

/**
 * Connect the socket using an access token.
 * Safe to call multiple times — won't create duplicate connections.
 */
export const connectSocket = (accessToken: string): TypedSocket => {
  if (socket?.connected) return socket;

  socket = io(WS_URL, {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  }) as TypedSocket;

  socket.on('connect', () => {
    console.debug('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.debug('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
};

/**
 * Get the current socket instance.
 * Returns null if not connected.
 */
export const getSocket = (): TypedSocket | null => socket;

/**
 * Disconnect and destroy the socket.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Reconnect with a new token (e.g., after token refresh).
 */
export const reconnectSocket = (accessToken: string): TypedSocket => {
  disconnectSocket();
  return connectSocket(accessToken);
};

// ── Typed event emitter helpers ───────────────────────────────────────────────

export const joinConversation = (conversationId: string) => {
  socket?.emit('conversation:join', conversationId);
};

export const leaveConversation = (conversationId: string) => {
  socket?.emit('conversation:leave', conversationId);
};

export const sendTypingStart = (conversationId: string) => {
  socket?.emit('typing:start', { conversationId });
};

export const sendTypingStop = (conversationId: string) => {
  socket?.emit('typing:stop', { conversationId });
};

export const sendReadReceipt = (conversationId: string, messageIds: string[]) => {
  socket?.emit('message:read', { conversationId, messageIds });
};

export const updatePresence = (status: 'online' | 'away' | 'busy' | 'offline') => {
  socket?.emit('presence:update', { status });
};

export default {
  connect: connectSocket,
  disconnect: disconnectSocket,
  reconnect: reconnectSocket,
  get: getSocket,
};
