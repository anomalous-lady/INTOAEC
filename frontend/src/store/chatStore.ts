"use client";

import { create } from "zustand";
import { type Room, type Message, type User, type Notification } from "@/data/mockData";
import { conversationApi, messageApi, userApi } from "@/lib/api";

// ── Shape adapters ────────────────────────────────────────────────────────────

function backendUserToLocal(u: {
  _id: string; username: string; displayName?: string;
  avatar?: string | null; isOnline?: boolean; lastSeen?: string;
  employeeId?: string; email?: string; bio?: string;
}): User {
  const name = u.displayName || u.username;
  const words = name.trim().split(" ");
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const COLORS = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899","#14b8a6","#f97316"];
  const colorIdx = u._id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length;
  return {
    id: u._id, name, initials,
    role: "Project Manager",
    avatarColor: COLORS[colorIdx],
    isOnline: u.isOnline ?? false,
    employeeId: u.employeeId,
    email: u.email,
    bio: u.bio,
    lastSeen: u.lastSeen
      ? new Date(u.lastSeen).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
      : undefined,
  };
}

function backendConvToRoom(conv: {
  _id: string; type: string; name?: string; description?: string;
  participants: { user: { _id: string; displayName?: string; username: string; employeeId?: string } }[];
  lastMessage?: { content?: string; createdAt: string; messageType?: string } | null;
  unreadCount?: number;
}, currentUserId: string): Room {
  const isDM = conv.type === "direct";
  let name = conv.name || (isDM ? "Direct Message" : "Group");
  
  // For DMs, use the other person's name
  if (isDM) {
    const other = conv.participants.find(p => p.user._id !== currentUserId);
    if (other) name = other.user.displayName || other.user.username;
  }

  const lastMsg = conv.lastMessage;
  let lastMsgText = lastMsg?.content ?? "";
  if (lastMsg?.messageType === "image") lastMsgText = "📷 Image";
  if (lastMsg?.messageType === "voice" || lastMsg?.messageType === "audio") lastMsgText = "🎤 Voice note";
  if (lastMsg?.messageType === "file") lastMsgText = "📎 File";

  return {
    id: conv._id,
    type: isDM ? "dm" : conv.type === "group" ? "warroom" : "external",
    name,
    description: conv.description,
    memberIds: conv.participants.map((p) => p.user._id),
    unreadCount: conv.unreadCount ?? 0,
    lastMessage: lastMsgText,
    lastMessageTime: lastMsg
      ? new Date(lastMsg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
      : "",
  };
}

function backendMsgToLocal(msg: {
  _id: string; conversationId: string; sender: { _id: string };
  content?: string; messageType: string;
  attachments?: { url: string; originalName: string; size: number; mimetype: string }[];
  reactions?: { emoji: string; user: string }[];
  createdAt: string; readBy?: { user: string }[];
}): Message {
  const att = msg.attachments?.[0];
  const isImage = att?.mimetype?.startsWith("image/");
  const isAudio = att?.mimetype?.startsWith("audio/");
  const isPdf = att?.mimetype === "application/pdf" || att?.originalName?.endsWith(".pdf");

  let type: Message["type"] = "text";
  if (isImage) type = "image";
  else if (isAudio) type = "voice";
  else if (isPdf) type = "pdf";
  else if (att) type = "file";
  else if (msg.messageType === "system") type = "system";

  return {
    id: msg._id,
    roomId: msg.conversationId,
    senderId: msg.sender._id,
    type,
    content: msg.content ?? "",
    imageUrl: isImage && att ? (`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"}${att.url}`) : undefined,
    voiceUrl: isAudio && att ? (`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"}${att.url}`) : undefined,
    fileName: (!isImage && !isAudio && att) ? att.originalName : undefined,
    fileUrl: (!isImage && !isAudio && att) ? (`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"}${att.url}`) : undefined,
    fileSize: att ? `${(att.size / 1024).toFixed(0)} KB` : undefined,
    timestamp: msg.createdAt,
    readBy: msg.readBy?.map((r) => r.user) ?? [],
    reactions: Object.entries(
      (msg.reactions ?? []).reduce((acc: Record<string, { count: number; reactedByMe: boolean }>, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, reactedByMe: false };
        acc[r.emoji].count++;
        return acc;
      }, {})
    ).map(([emoji, val]) => ({ emoji, ...val })),
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ChatState {
  users: User[];
  rooms: Room[];
  messages: Record<string, Message[]>;
  notifications: Notification[];
  unreadNotifCount: number;

  selectedRoomId: string | null;
  sidebarOpen: boolean;
  rightPaneOpen: boolean;
  globalSearch: string;
  sidebarSearch: string;
  internalExpanded: boolean;
  externalExpanded: boolean;
  currentUserId: string;
  isLoadingRooms: boolean;

  selectedRoom: Room | null;
  selectedMessages: Message[];

  // Actions
  loadConversations: () => Promise<void>;
  selectRoom: (roomId: string) => void;
  sendMessage: (content: string, type?: Message["type"], extra?: Partial<Message>) => void;
  sendFileMessage: (conversationId: string, files: File[]) => Promise<void>;
  createWarRoom: (name: string, description: string, memberIds: string[]) => void;
  startDM: (userId: string) => Promise<void>;
  addNotification: (notif: Omit<Notification, "id">) => void;
  markNotifsRead: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleRightPane: () => void;
  setGlobalSearch: (q: string) => void;
  setSidebarSearch: (q: string) => void;
  setInternalExpanded: (v: boolean) => void;
  setExternalExpanded: (v: boolean) => void;
  markRoomRead: (roomId: string) => void;
  setCurrentUserId: (id: string) => void;
  addIncomingMessage: (roomId: string, msg: Message) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  users: [], rooms: [], messages: {},
  notifications: [], unreadNotifCount: 0,
  selectedRoomId: null, sidebarOpen: false, rightPaneOpen: false,
  globalSearch: "", sidebarSearch: "",
  internalExpanded: true, externalExpanded: false,
  currentUserId: "", isLoadingRooms: false,

  get selectedRoom() {
    const id = get().selectedRoomId;
    return id ? get().rooms.find((r) => r.id === id) ?? null : null;
  },
  get selectedMessages() {
    const id = get().selectedRoomId;
    return id ? get().messages[id] ?? [] : [];
  },

  loadConversations: async () => {
    set({ isLoadingRooms: true });
    try {
      const res = await conversationApi.getAll();
      const convs = (res.data?.conversations ?? []) as Parameters<typeof backendConvToRoom>[0][];
      const currentUserId = get().currentUserId;
      const userMap = new Map<string, User>();
      convs.forEach((conv) =>
        conv.participants.forEach((p) => {
          if (!userMap.has(p.user._id)) userMap.set(p.user._id, backendUserToLocal(p.user));
        })
      );
      set({ rooms: convs.map(c => backendConvToRoom(c, currentUserId)), users: Array.from(userMap.values()) });
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      set({ isLoadingRooms: false });
    }
  },

  selectRoom: async (roomId) => {
    set({ selectedRoomId: roomId, rightPaneOpen: false });
    get().markRoomRead(roomId);
    if (!get().messages[roomId]) {
      try {
        const res = await messageApi.getMessages(roomId);
        const msgs = ((res.data?.messages ?? []) as Parameters<typeof backendMsgToLocal>[0][]).map(backendMsgToLocal);
        set((s) => ({ messages: { ...s.messages, [roomId]: msgs } }));
      } catch (err) { console.error("Failed to load messages:", err); }
    }
  },

  sendMessage: async (content, type = "text", extra = {}) => {
    const { selectedRoomId, currentUserId, messages, rooms } = get();
    if (!selectedRoomId || !content.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId, roomId: selectedRoomId, senderId: currentUserId,
      type, content, timestamp: new Date().toISOString(),
      readBy: [currentUserId], reactions: [], ...extra,
    };
    set({
      messages: { ...messages, [selectedRoomId]: [...(messages[selectedRoomId] ?? []), tempMsg] },
      rooms: rooms.map((r) =>
        r.id === selectedRoomId ? { ...r, lastMessage: content, lastMessageTime: "Just now", unreadCount: 0 } : r
      ),
    });

    try {
      const res = await messageApi.send(selectedRoomId, { content });
      const realMsg = backendMsgToLocal(res.data!.message as Parameters<typeof backendMsgToLocal>[0]);
      set((s) => ({
        messages: {
          ...s.messages,
          [selectedRoomId]: (s.messages[selectedRoomId] ?? []).map((m) => m.id === tempId ? realMsg : m),
        },
      }));
    } catch (err) {
      console.error("Failed to send message:", err);
      set((s) => ({
        messages: {
          ...s.messages,
          [selectedRoomId]: (s.messages[selectedRoomId] ?? []).filter((m) => m.id !== tempId),
        },
      }));
    }
  },

  sendFileMessage: async (conversationId, files) => {
    const { currentUserId, messages, rooms } = get();
    const tempId = `temp-file-${Date.now()}`;
    const file = files[0];
    const isImage = file.type.startsWith("image/");
    const isAudio = file.type.startsWith("audio/");

    let previewUrl: string | undefined;
    if (isImage) previewUrl = URL.createObjectURL(file);
    if (isAudio) previewUrl = URL.createObjectURL(file);

    const tempMsg: Message = {
      id: tempId, roomId: conversationId, senderId: currentUserId,
      type: isImage ? "image" : isAudio ? "voice" : "file",
      content: "",
      imageUrl: isImage ? previewUrl : undefined,
      voiceUrl: isAudio ? previewUrl : undefined,
      fileName: (!isImage && !isAudio) ? file.name : undefined,
      fileSize: `${(file.size / 1024).toFixed(0)} KB`,
      timestamp: new Date().toISOString(),
      readBy: [currentUserId], reactions: [],
    };

    set({
      messages: { ...messages, [conversationId]: [...(messages[conversationId] ?? []), tempMsg] },
      rooms: rooms.map((r) =>
        r.id === conversationId ? { ...r, lastMessage: isImage ? "📷 Image" : isAudio ? "🎤 Voice note" : "📎 File", lastMessageTime: "Just now", unreadCount: 0 } : r
      ),
    });

    try {
      const res = await messageApi.send(conversationId, { files });
      const realMsg = backendMsgToLocal(res.data!.message as Parameters<typeof backendMsgToLocal>[0]);
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] ?? []).map((m) => m.id === tempId ? realMsg : m),
        },
      }));
    } catch (err) {
      console.error("Failed to send file:", err);
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] ?? []).filter((m) => m.id !== tempId),
        },
      }));
    }
  },

  startDM: async (userId: string) => {
    try {
      const res = await conversationApi.getDirect(userId);
      const conv = res.data!.conversation;
      const currentUserId = get().currentUserId;
      const room = backendConvToRoom(conv as Parameters<typeof backendConvToRoom>[0], currentUserId);
      set((s) => {
        const exists = s.rooms.find(r => r.id === room.id);
        return exists ? {} : { rooms: [room, ...s.rooms] };
      });
      // Add participants to users map
      const userMap = new Map(get().users.map(u => [u.id, u]));
      (conv.participants as { user: Parameters<typeof backendUserToLocal>[0] }[]).forEach(p => {
        if (!userMap.has(p.user._id)) userMap.set(p.user._id, backendUserToLocal(p.user));
      });
      set({ users: Array.from(userMap.values()) });
      get().selectRoom(room.id);
    } catch (err) {
      console.error("Failed to start DM:", err);
    }
  },

  createWarRoom: async (name, description, memberIds) => {
    try {
      const res = await conversationApi.createGroup({ name, description, participantIds: memberIds });
      const currentUserId = get().currentUserId;
      const room = backendConvToRoom(res.data!.conversation as Parameters<typeof backendConvToRoom>[0], currentUserId);
      set((s) => ({ rooms: [...s.rooms, room] }));
      get().selectRoom(room.id);
    } catch (err) { console.error("Failed to create war room:", err); }
  },

  addNotification: (notif) => {
    const n: Notification = { ...notif, id: `notif-${Date.now()}` };
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 50),
      unreadNotifCount: s.unreadNotifCount + 1,
    }));
  },

  markNotifsRead: () => {
    set((s) => ({
      notifications: s.notifications.map(n => ({ ...n, read: true })),
      unreadNotifCount: 0,
    }));
  },

  addIncomingMessage: (roomId, msg) => {
    const { selectedRoomId, currentUserId } = get();
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: [...(s.messages[roomId] ?? []), msg],
      },
      rooms: s.rooms.map(r => r.id === roomId ? {
        ...r,
        lastMessage: msg.content || (msg.type === "image" ? "📷 Image" : msg.type === "voice" ? "🎤 Voice note" : "📎 File"),
        lastMessageTime: "Just now",
        unreadCount: selectedRoomId === roomId ? 0 : r.unreadCount + 1,
      } : r),
    }));
    // Show notification if not in this room
    if (selectedRoomId !== roomId && msg.senderId !== currentUserId) {
      const room = get().rooms.find(r => r.id === roomId);
      const sender = get().users.find(u => u.id === msg.senderId);
      if (room && sender) {
        get().addNotification({
          roomId,
          roomName: room.name,
          senderName: sender.name,
          content: msg.content || (msg.type === "image" ? "Sent a photo" : msg.type === "voice" ? "Sent a voice note" : "Sent a file"),
          timestamp: msg.timestamp,
          read: false,
          type: "message",
        });
      }
    }
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleRightPane: () => set((s) => ({ rightPaneOpen: !s.rightPaneOpen })),
  setGlobalSearch: (q) => set({ globalSearch: q }),
  setSidebarSearch: (q) => set({ sidebarSearch: q }),
  setInternalExpanded: (v) => set({ internalExpanded: v }),
  setExternalExpanded: (v) => set({ externalExpanded: v }),
  setCurrentUserId: (id) => set({ currentUserId: id }),
  markRoomRead: (roomId) =>
    set((s) => ({ rooms: s.rooms.map((r) => r.id === roomId ? { ...r, unreadCount: 0 } : r) })),
}));

export const useSelectedRoom = () => {
  const { rooms, selectedRoomId } = useChatStore();
  return selectedRoomId ? rooms.find((r) => r.id === selectedRoomId) ?? null : null;
};
export const useSelectedMessages = () => {
  const { messages, selectedRoomId } = useChatStore();
  return selectedRoomId ? messages[selectedRoomId] ?? [] : [];
};
export const useUser = (userId: string) => {
  const { users } = useChatStore();
  return users.find((u) => u.id === userId);
};
export const useCurrentUser = () => {
  const { users, currentUserId } = useChatStore();
  return users.find((u) => u.id === currentUserId)!;
};
