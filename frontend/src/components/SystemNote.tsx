"use client";

import { Bot } from "lucide-react";

interface SystemNoteProps {
    content: string;
    timestamp?: string;
}

export function SystemNote({ content, timestamp }: SystemNoteProps) {
    // Format timestamp if provided
    const formattedTime = timestamp
        ? new Date(timestamp).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        })
        : null;

    return (
        <div className="flex justify-center my-3 px-4">
            <div
                className="flex items-start gap-2 rounded-xl px-4 py-2.5 max-w-2xl text-center"
                style={{
                    background: "rgba(55, 65, 81, 0.5)",
                    border: "1px solid rgba(75, 85, 99, 0.4)",
                    backdropFilter: "blur(4px)",
                }}
            >
                <Bot className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#94a3b8" }} />
                <div>
                    <p className="text-xs italic leading-relaxed" style={{ color: "#9ca3af" }}>
                        {content}
                    </p>
                    {formattedTime && (
                        <p className="text-[10px] mt-0.5" style={{ color: "#4b5563" }}>
                            {formattedTime}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
