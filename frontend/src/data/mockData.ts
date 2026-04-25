// IntoAEC Unified Communication Module – Type Definitions

export type UserRole =
  | "Architect" | "Civil Engineer" | "Structural Engineer"
  | "MEP Engineer" | "Project Manager" | "Site Supervisor"
  | "Procurement Officer" | "Finance & Billing Lead"
  | "BIM Coordinator" | "Business Development" | "External Contact";

export interface User {
  id: string;
  name: string;
  initials: string;
  role: UserRole;
  avatarColor: string;
  isOnline: boolean;
  lastSeen?: string;
  employeeId?: string;
  email?: string;
  bio?: string;
}

export type RoomType = "dm" | "warroom" | "external";

export interface Room {
  id: string;
  type: RoomType;
  name: string;
  description?: string;
  memberIds: string[];
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  vendorCompany?: string;
  vendorContact?: string;
  vendorEmail?: string;
  vendorPhone?: string;
}

export type MessageType = "text" | "image" | "pdf" | "system" | "voice" | "file" | "ai-summary";

export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

/** Structured data extracted from an AI call summary */
export interface SummaryData {
  overallSummary?: string;
  actionItems?: string[];
  pricesQuoted?: string[];
  keyDates?: string[];
  callDuration?: number | null;
  callId?: string | null;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  type: MessageType;
  content: string;
  imageUrl?: string;
  imageCaption?: string;
  fileName?: string;
  fileSize?: string;
  fileUrl?: string;
  voiceUrl?: string;
  voiceDuration?: number;
  timestamp: string;
  readBy: string[];
  reactions: Reaction[];
  /** Present on AI-generated call summary messages */
  summaryData?: SummaryData;
}

export interface Notification {
  id: string;
  roomId: string;
  roomName: string;
  senderName: string;
  content: string;
  timestamp: string;
  read: boolean;
  type: "message" | "mention" | "call";
}

export const USERS: User[] = [];
export const ROOMS: Room[] = [];
export const MESSAGES: Record<string, Message[]> = {};
