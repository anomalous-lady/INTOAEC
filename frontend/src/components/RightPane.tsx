"use client";

import { X, Info, Users, Pin, Hash, MessageSquare } from "lucide-react";
import { useChatStore, useSelectedRoom } from "@/store/chatStore";
import { Button } from "@/components/ui/button";

export function RightPane() {
    const { rightPaneOpen, toggleRightPane, users } = useChatStore();
    const selectedRoom = useSelectedRoom();

    if (!rightPaneOpen || !selectedRoom) return null;

    const members = selectedRoom.memberIds
        .map((id) => users.find((u) => u.id === id))
        .filter(Boolean) as typeof users;

    return (
        <aside
            className="flex flex-col border-l overflow-y-auto"
            style={{
                width: 300,
                background: "#161b22",
                borderColor: "#2d3748",
                flexShrink: 0,
                scrollbarWidth: "thin",
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0"
                style={{ borderColor: "#2d3748" }}
            >
                <div className="flex items-center gap-2">
                    <Info className="w-4 h-4" style={{ color: "#3b82f6" }} />
                    <h3 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>
                        Room Details
                    </h3>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleRightPane}
                    className="h-7 w-7 hover:bg-white/5 rounded"
                    style={{ color: "#64748b" }}
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                {/* About */}
                <section>
                    <div className="flex items-center gap-1.5 mb-2.5">
                        {selectedRoom.type === "warroom" ? (
                            <Hash className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                        ) : (
                            <MessageSquare className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                        )}
                        <h4 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>
                            About
                        </h4>
                    </div>

                    <div
                        className="rounded-xl p-3.5"
                        style={{ background: "#0f1117", border: "1px solid #2d3748" }}
                    >
                        <p className="font-semibold text-sm mb-1" style={{ color: "#f1f5f9" }}>
                            {selectedRoom.type === "warroom" ? "#" : ""}
                            {selectedRoom.name}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
                            {selectedRoom.description ?? "No description provided."}
                        </p>
                        {selectedRoom.type === "external" && selectedRoom.vendorCompany && (
                            <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: "#2d3748" }}>
                                <p className="text-[11px]" style={{ color: "#64748b" }}>
                                    <span style={{ color: "#94a3b8" }}>Company: </span>
                                    {selectedRoom.vendorCompany}
                                </p>
                                {selectedRoom.vendorContact && (
                                    <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                                        <span style={{ color: "#94a3b8" }}>Contact: </span>
                                        {selectedRoom.vendorContact}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* Members */}
                <section>
                    <div className="flex items-center gap-1.5 mb-2.5">
                        <Users className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                        <h4 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>
                            Members ({members.length})
                        </h4>
                    </div>

                    <div className="space-y-1.5">
                        {members.map((user) => (
                            <div
                                key={user.id}
                                className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                                style={{ background: "#0f1117" }}
                            >
                                <div className="relative flex-shrink-0">
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs text-white"
                                        style={{ background: user.avatarColor }}
                                    >
                                        {user.initials}
                                    </div>
                                    <span
                                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                                        style={{
                                            background: user.isOnline ? "#22c55e" : "#6b7280",
                                            borderColor: "#0f1117",
                                        }}
                                    />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-medium truncate" style={{ color: "#f1f5f9" }}>
                                            {user.name}
                                        </p>
                                        {user.id === "me" && (
                                            <span
                                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                                style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}
                                            >
                                                You
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] truncate" style={{ color: "#64748b" }}>
                                        {user.role}
                                    </p>
                                </div>

                                <span
                                    className="text-[10px] flex-shrink-0"
                                    style={{ color: user.isOnline ? "#22c55e" : "#6b7280" }}
                                >
                                    {user.isOnline ? "●" : "○"}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Pinned items */}
                <section>
                    <div className="flex items-center gap-1.5 mb-2.5">
                        <Pin className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                        <h4 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>
                            Pinned Items
                        </h4>
                    </div>

                    <div
                        className="rounded-xl p-4 text-center"
                        style={{
                            background: "#0f1117",
                            border: "1px dashed #374151",
                        }}
                    >
                        <Pin className="w-6 h-6 mx-auto mb-2" style={{ color: "#374151" }} />
                        <p className="text-xs" style={{ color: "#4b5563" }}>
                            No pinned messages yet
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: "#374151" }}>
                            Pin important messages to find them easily
                        </p>
                    </div>
                </section>
            </div>
        </aside>
    );
}
