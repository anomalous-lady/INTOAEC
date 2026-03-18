"use client";

import { useRef, useState } from "react";
import { Check, CheckCheck, Download, FileText, Play, Pause, Mic } from "lucide-react";
import { type Message, type User } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  sender?: User;
  showAvatar: boolean;
  showSenderName: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function VoicePlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2.5 mt-1" style={{ minWidth: 200 }}>
      <audio ref={audioRef} src={url}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={e => { const a = e.target as HTMLAudioElement; setProgress(a.currentTime / (a.duration || 1) * 100); }}
        onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
      />
      <button onClick={toggle} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.2)" }}>
        {playing ? <Pause className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} /> : <Play className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "#3b82f6" }} />
        </div>
        <div className="flex items-center gap-1">
          <Mic className="w-2.5 h-2.5" style={{ color: "#64748b" }} />
          <span className="text-[10px]" style={{ color: "#64748b" }}>{fmtSecs(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export function MessageBubble({ message, isOwn, sender, showAvatar, showSenderName }: MessageBubbleProps) {
  const allRead = message.readBy.length > 1;

  return (
    <div className={cn("flex gap-2.5 px-4 py-0.5 group msg-enter", isOwn ? "flex-row-reverse" : "flex-row")}>
      {!isOwn && (
        <div className="flex-shrink-0 w-8">
          {showAvatar && sender ? (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs text-white" style={{ background: sender.avatarColor }}>
              {sender.initials}
            </div>
          ) : null}
        </div>
      )}

      <div className={cn("flex flex-col max-w-[70%] min-w-0", isOwn ? "items-end" : "items-start")}>
        {!isOwn && showSenderName && sender && (
          <div className="flex items-baseline gap-2 mb-1 px-1">
            <span className="text-xs font-semibold" style={{ color: sender.avatarColor }}>{sender.name}</span>
            {sender.employeeId && <span className="text-[10px] font-mono" style={{ color: "#3b82f6" }}>{sender.employeeId}</span>}
            <span className="text-[10px]" style={{ color: "#4b5563" }}>{sender.role}</span>
          </div>
        )}

        <div
          className={cn("rounded-2xl px-3.5 py-2 text-sm leading-relaxed", isOwn ? "rounded-tr-sm" : "rounded-tl-sm")}
          style={{
            background: isOwn ? "rgba(59,130,246,0.18)" : "#1f2937",
            color: "#f1f5f9",
            border: isOwn ? "1px solid rgba(59,130,246,0.25)" : "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        >
          {/* Text */}
          {(message.type === "text" || message.type === "system") && message.content && (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}

          {/* Image */}
          {message.type === "image" && message.imageUrl && (
            <div className="rounded-xl overflow-hidden" style={{ maxWidth: 280 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={message.imageUrl} alt="Image" className="w-full object-cover" style={{ maxHeight: 220 }} />
              {message.content && <div className="px-2 py-1.5 text-xs" style={{ background: "rgba(0,0,0,0.4)", color: "#9ca3af" }}>{message.content}</div>}
            </div>
          )}

          {/* Voice note */}
          {message.type === "voice" && message.voiceUrl && (
            <VoicePlayer url={message.voiceUrl} />
          )}

          {/* File / PDF */}
          {(message.type === "pdf" || message.type === "file") && message.fileName && (
            <a
              href={message.fileUrl ?? "#"}
              download={message.fileName}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer group/f"
              style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 200, textDecoration: "none" }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(239,68,68,0.2)" }}>
                <FileText className="w-5 h-5" style={{ color: "#ef4444" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "#f1f5f9" }}>{message.fileName}</p>
                <p className="text-[11px]" style={{ color: "#6b7280" }}>{message.fileSize}</p>
              </div>
              <Download className="w-4 h-4 opacity-0 group-hover/f:opacity-100 transition-opacity flex-shrink-0" style={{ color: "#3b82f6" }} />
            </a>
          )}
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap px-1">
            {message.reactions.map((r, i) => (
              <span key={i} className={cn("reaction-chip", r.reactedByMe && "reacted")}>
                {r.emoji}
                <span className="text-[11px]" style={{ color: "#94a3b8" }}>{r.count}</span>
              </span>
            ))}
          </div>
        )}

        {/* Timestamp + read receipt */}
        <div className="flex items-center gap-1 mt-0.5 px-1">
          <span className="text-[10px]" style={{ color: "#4b5563" }}>{formatTime(message.timestamp)}</span>
          {isOwn && (
            <span style={{ color: allRead ? "#3b82f6" : "#6b7280" }}>
              {allRead ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
