"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatWindow } from "@/components/ChatWindow";
import { ChatInput } from "@/components/ChatInput";
import { RightPane } from "@/components/RightPane";
import { CallModal } from "@/components/CallModal";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { getSocket } from "@/lib/socket";
import { type Message } from "@/data/mockData";

interface IncomingCall {
  roomId: string;
  callType: "audio" | "video";
  offer: RTCSessionDescriptionInit;
  callId: string;
  caller: { _id: string; username: string; displayName?: string; avatar?: string | null };
}

export default function Home() {
  const { selectedRoomId, loadConversations, setCurrentUserId, addIncomingMessage, users } = useChatStore();
  const { isAuthenticated, isLoading, restoreSession, user } = useAuthStore();
  const router = useRouter();

  const [callState, setCallState] = useState<{
    open: boolean;
    conversationId: string;
    callType: "audio" | "video";
    mode: "outgoing" | "incoming";
    remoteUser: { name: string; initials: string; avatarColor: string };
    roomId?: string;
    offer?: RTCSessionDescriptionInit;
    callerId?: string;
  } | null>(null);

  useEffect(() => { restoreSession(); }, [restoreSession]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && user) {
      setCurrentUserId(user._id);
      loadConversations();
    }
  }, [isAuthenticated, user, setCurrentUserId, loadConversations]);

  // Wire socket for real-time messages and calls
  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getSocket();
    if (!socket) return;

    // Real-time message handler
    socket.on("message:new", (msg) => {
      const localMsg: Message = {
        id: msg._id,
        roomId: msg.conversationId,
        senderId: msg.sender._id,
        type: "text",
        content: msg.content ?? "",
        timestamp: msg.createdAt,
        readBy: msg.readBy?.map((r: { user: string }) => r.user) ?? [],
        reactions: [],
      };
      addIncomingMessage(msg.conversationId, localMsg);
    });

    // Incoming call handler
    socket.on("webrtc:incoming-call", ({ roomId, callType, offer, caller }) => {
      const callerUser = users.find(u => u.id === caller._id);
      const name = caller.displayName || caller.username;
      const initials = name.slice(0, 2).toUpperCase();
      const COLORS = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444","#ec4899"];
      const color = COLORS[caller._id.charCodeAt(0) % COLORS.length];

      setCallState({
        open: true,
        conversationId: "",
        callType,
        mode: "incoming",
        remoteUser: callerUser
          ? { name: callerUser.name, initials: callerUser.initials, avatarColor: callerUser.avatarColor }
          : { name, initials, avatarColor: color },
        roomId,
        offer,
        callerId: caller._id,
      });
    });

    return () => {
      socket.off("message:new");
      socket.off("webrtc:incoming-call");
    };
  }, [isAuthenticated, users, addIncomingMessage]);

  const handleStartCall = (type: "audio" | "video") => {
    if (!selectedRoomId) return;
    const room = useChatStore.getState().rooms.find(r => r.id === selectedRoomId);
    const otherUserId = room?.memberIds.find(id => id !== user?._id);
    const otherUser = useChatStore.getState().users.find(u => u.id === otherUserId);
    setCallState({
      open: true,
      conversationId: selectedRoomId,
      callType: type,
      mode: "outgoing",
      remoteUser: otherUser
        ? { name: otherUser.name, initials: otherUser.initials, avatarColor: otherUser.avatarColor }
        : { name: room?.name ?? "Unknown", initials: (room?.name ?? "??").slice(0, 2).toUpperCase(), avatarColor: "#3b82f6" },
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#0f1117" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-lg" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>IA</div>
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }} />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#0f1117" }}>
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ background: "#0f1117" }}>
          {selectedRoomId && <ChatHeader onStartCall={handleStartCall} />}
          <ChatWindow />
          {selectedRoomId && <ChatInput />}
        </main>
        <RightPane />
      </div>

      {/* Call modal */}
      {callState?.open && (
        <CallModal
          conversationId={callState.conversationId}
          callType={callState.callType}
          mode={callState.mode}
          remoteUser={callState.remoteUser}
          roomId={callState.roomId}
          offer={callState.offer}
          callerId={callState.callerId}
          onClose={() => setCallState(null)}
        />
      )}
    </div>
  );
}
