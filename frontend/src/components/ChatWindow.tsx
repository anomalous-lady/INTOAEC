"use client";

import { useEffect, useRef, useMemo } from "react";
import { useChatStore, useSelectedMessages, useSelectedRoom } from "@/store/chatStore";
import { MessageBubble } from "./MessageBubble";
import { SystemNote } from "./SystemNote";
import { Building2, MessageSquareDashed } from "lucide-react";

function formatDateLabel(isoString: string): string {
    const d = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export function ChatWindow() {
    const messages = useSelectedMessages();
    const selectedRoom = useSelectedRoom();
    const { users, currentUserId } = useChatStore();
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Group messages by date for dividers
    const groups = useMemo(() => {
        if (!messages.length) return [];
        const result: { date: string; messages: typeof messages }[] = [];
        let currentDate = "";

        for (const msg of messages) {
            const dateLabel = formatDateLabel(msg.timestamp);
            if (dateLabel !== currentDate) {
                currentDate = dateLabel;
                result.push({ date: dateLabel, messages: [msg] });
            } else {
                result[result.length - 1].messages.push(msg);
            }
        }
        return result;
    }, [messages]);

    // Empty/welcome state
    if (!selectedRoom) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center"
                style={{ background: "#0f1117" }}>
                <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                    style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59,130,246,0.2)" }}
                >
                    <Building2 className="w-10 h-10" style={{ color: "#3b82f6" }} />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "#f1f5f9" }}>
                    Welcome to IntoAEC
                </h2>
                <p className="text-sm leading-relaxed max-w-sm" style={{ color: "#64748b" }}>
                    Select a chat from the sidebar to start collaborating with your AEC team.
                    All conversations are secure, native, and 100% yours.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-3 max-w-sm w-full">
                    {[
                        { icon: "💬", label: "Direct Messages", desc: "1-to-1 with teammates" },
                        { icon: "⚔️", label: "War Rooms", desc: "Project group channels" },
                        { icon: "📎", label: "File Sharing", desc: "PDFs, images & more" },
                    ].map((item) => (
                        <div
                            key={item.label}
                            className="rounded-xl p-3 text-center"
                            style={{ background: "#161b22", border: "1px solid #2d3748" }}
                        >
                            <div className="text-2xl mb-1">{item.icon}</div>
                            <p className="text-xs font-semibold mb-0.5" style={{ color: "#f1f5f9" }}>
                                {item.label}
                            </p>
                            <p className="text-[11px]" style={{ color: "#64748b" }}>
                                {item.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Empty room state
    if (messages.length === 0) {
        return (
            <div
                className="flex-1 flex flex-col items-center justify-center px-8 text-center"
                style={{ background: "#0f1117" }}
            >
                <MessageSquareDashed className="w-12 h-12 mb-4" style={{ color: "#374151" }} />
                <p className="text-sm" style={{ color: "#64748b" }}>
                    No messages yet. Start the conversation!
                </p>
            </div>
        );
    }

    return (
        <div
            className="flex-1 overflow-y-auto py-3"
            style={{ background: "#0f1117", scrollbarWidth: "thin" }}
        >
            {groups.map((group) => (
                <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 px-4 my-3">
                        <div className="flex-1 h-px" style={{ background: "#2d3748" }} />
                        <span
                            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                            style={{
                                color: "#64748b",
                                background: "#161b22",
                                border: "1px solid #2d3748",
                            }}
                        >
                            {group.date}
                        </span>
                        <div className="flex-1 h-px" style={{ background: "#2d3748" }} />
                    </div>

                    {/* Messages within this date group */}
                    {group.messages.map((msg, idx) => {
                        // System or AI call-summary notes → render as SystemNote
                        if (msg.type === "system" || msg.type === "ai-summary") {
                            return (
                                <SystemNote
                                    key={msg.id}
                                    content={msg.content}
                                    timestamp={msg.timestamp}
                                    summaryData={msg.summaryData}
                                />
                            );
                        }

                        const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
                        const isOwn = msg.senderId === currentUserId;
                        const sender = users.find((u) => u.id === msg.senderId);

                        // Show avatar + name only on first message of a sender sequence
                        const isSameSequence =
                            prevMsg &&
                            prevMsg.senderId === msg.senderId &&
                            prevMsg.type !== "system" &&
                            new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() <
                            5 * 60 * 1000; // 5 min gap

                        const showAvatar = !isSameSequence;
                        const showSenderName = !isSameSequence && !isOwn;

                        return (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isOwn={isOwn}
                                sender={sender}
                                showAvatar={showAvatar}
                                showSenderName={showSenderName}
                            />
                        );
                    })}
                </div>
            ))}

            {/* Scroll anchor */}
            <div ref={bottomRef} className="h-2" />
        </div>
    );
}
