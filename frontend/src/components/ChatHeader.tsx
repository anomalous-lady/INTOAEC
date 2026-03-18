"use client";

import { Phone, Video, Info, Hash, MessageSquare } from "lucide-react";
import { useChatStore, useSelectedRoom } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  onStartCall?: (type: "audio" | "video") => void;
}

export function ChatHeader({ onStartCall }: ChatHeaderProps) {
  const selectedRoom = useSelectedRoom();
  const { toggleRightPane, rightPaneOpen, users } = useChatStore();
  const { user: currentUser } = useAuthStore();

  if (!selectedRoom) return null;

  const otherUserId = selectedRoom.type === "dm"
    ? selectedRoom.memberIds.find(id => id !== currentUser?._id)
    : null;
  const otherUser = otherUserId ? users.find(u => u.id === otherUserId) : null;
  const isOnline = otherUser?.isOnline ?? false;
  const memberCount = selectedRoom.memberIds.length;

  return (
    <div className="flex items-center px-4 h-14 border-b flex-shrink-0 gap-3"
      style={{ background: "#161b22", borderColor: "#2d3748", boxShadow: "0 1px 0 0 rgba(255,255,255,0.04)" }}>

      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {selectedRoom.type === "dm" && otherUser ? (
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs text-white" style={{ background: otherUser.avatarColor }}>
              {otherUser.initials}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" style={{ background: isOnline ? "#22c55e" : "#6b7280", borderColor: "#161b22" }} />
          </div>
        ) : selectedRoom.type === "warroom" ? (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.15)" }}>
            <Hash className="w-4 h-4" style={{ color: "#3b82f6" }} />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.12)" }}>
            <MessageSquare className="w-4 h-4" style={{ color: "#22c55e" }} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {selectedRoom.type === "warroom" && <span className="text-sm font-bold" style={{ color: "#3b82f6" }}>#</span>}
            <h2 className="font-semibold text-sm truncate" style={{ color: "#f1f5f9" }}>{selectedRoom.name}</h2>
            {selectedRoom.type === "dm" && otherUser && (
              <span className="text-xs flex-shrink-0" style={{ color: isOnline ? "#22c55e" : "#6b7280" }}>
                ● {isOnline ? "Online" : `Last seen ${otherUser.lastSeen ?? "a while ago"}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedRoom.type === "dm" && otherUser && (
              <span className="text-xs" style={{ color: "#64748b" }}>
                {otherUser.employeeId && <span className="font-mono mr-1" style={{ color: "#3b82f6" }}>{otherUser.employeeId}</span>}
                {otherUser.role}
              </span>
            )}
            {(selectedRoom.type === "warroom" || selectedRoom.type === "external") && (
              <span className="text-xs" style={{ color: "#64748b" }}>
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/5 rounded-lg" title="Audio call"
          style={{ color: "#3b82f6" }} onClick={() => onStartCall?.("audio")}>
          <Phone className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/5 rounded-lg" title="Video call"
          style={{ color: "#3b82f6" }} onClick={() => onStartCall?.("video")}>
          <Video className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleRightPane} className="h-8 w-8 hover:bg-white/5 rounded-lg transition-colors" title="Room details"
          style={{ color: rightPaneOpen ? "#3b82f6" : "#94a3b8", background: rightPaneOpen ? "rgba(59,130,246,0.12)" : undefined }}>
          <Info className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
