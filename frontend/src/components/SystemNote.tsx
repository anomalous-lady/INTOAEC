"use client";

import { useState } from "react";
import {
  Bot, Sparkles, Phone, ChevronDown, ChevronUp,
  CheckCircle2, DollarSign, CalendarDays, FileText,
} from "lucide-react";
import { type SummaryData } from "@/data/mockData";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemNoteProps {
  content: string;
  timestamp?: string;
  summaryData?: SummaryData;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtDuration(seconds: number | null | undefined) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Strip the leading "📞 **Call Summary…**\n\n" header the AI pipeline prepends */
function stripHeader(text: string) {
  return text
    .replace(/^📞\s*\*\*Call.*?\*\*\n\n/s, "")
    .replace(/^📞\s*\*\*Call.*?\n\n/s, "")
    .trim();
}

// ── Lightweight inline-markdown renderer ──────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#e2e8f0", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t) { out.push(<div key={key++} style={{ height: 5 }} />); continue; }
    if (t.startsWith("## ")) {
      out.push(
        <p key={key++} style={{ color: "#a5b4fc", fontWeight: 600, fontSize: 10, marginTop: 8, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {t.slice(3)}
        </p>
      );
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      out.push(
        <div key={key++} className="flex gap-1.5" style={{ marginLeft: 4 }}>
          <span style={{ color: "#6366f1", flexShrink: 0, marginTop: 1 }}>•</span>
          <span style={{ color: "#cbd5e1", fontSize: 11 }}>{renderInline(t.slice(2))}</span>
        </div>
      );
    } else {
      out.push(
        <p key={key++} style={{ color: "#cbd5e1", fontSize: 11, lineHeight: 1.55 }}>
          {renderInline(t)}
        </p>
      );
    }
  }
  return out;
}

// ── Section component ─────────────────────────────────────────────────────────

function SummarySection({
  icon, label, items, color, emptyLabel,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  color: string;
  emptyLabel: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span style={{ color }}>{icon}</span>
        <span style={{ color, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 pl-1">
          <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span style={{ color: "#cbd5e1", fontSize: 11, lineHeight: 1.5 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

// ── AI Call Summary Card ──────────────────────────────────────────────────────

function AiCallSummaryCard({ content, timestamp, summaryData }: SystemNoteProps) {
  const [expanded, setExpanded] = useState(false);

  const hasActions = (summaryData?.actionItems?.length ?? 0) > 0;
  const hasPrices  = (summaryData?.pricesQuoted?.length ?? 0) > 0;
  const hasDates   = (summaryData?.keyDates?.length ?? 0) > 0;
  const hasStructured = hasActions || hasPrices || hasDates;
  const duration = fmtDuration(summaryData?.callDuration);

  // Fallback: strip noise and render plain markdown if no structured data
  const plainContent = stripHeader(content);

  return (
    <div className="flex justify-center my-4 px-4">
      <div
        className="rounded-2xl w-full overflow-hidden"
        style={{
          maxWidth: 560,
          background: "linear-gradient(160deg, rgba(88,28,135,0.12) 0%, rgba(49,46,129,0.10) 60%, rgba(15,17,23,0.95) 100%)",
          border: "1px solid rgba(139,92,246,0.25)",
          boxShadow: "0 4px 32px rgba(139,92,246,0.08), 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* ── Top gradient line */}
        <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, #7c3aed 40%, #3b82f6 60%, transparent)" }} />

        {/* ── Header */}
        <div
          className="flex items-center gap-2.5 px-4 py-2.5"
          style={{ background: "rgba(109,40,217,0.08)", borderBottom: "1px solid rgba(109,40,217,0.12)" }}
        >
          {/* AI icon */}
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.2))" }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} />
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Phone className="w-3 h-3 flex-shrink-0" style={{ color: "#818cf8" }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: "#a5b4fc" }}>
              AI Call Summary
            </span>
            {duration && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0"
                style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}>
                {duration}
              </span>
            )}
          </div>

          {timestamp && (
            <span className="text-[10px] flex-shrink-0" style={{ color: "#4b5563" }}>{fmtTime(timestamp)}</span>
          )}
        </div>

        {/* ── Body */}
        <div className="px-4 py-3 flex flex-col gap-3">

          {/* Overall Summary */}
          {summaryData?.overallSummary ? (
            <p style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.6 }}>
              {summaryData.overallSummary}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {renderMarkdown(plainContent.split("## Action Items")[0]?.replace(/## Summary\n?/i, "").trim())}
            </div>
          )}

          {/* Structured sections */}
          {hasStructured && (
            <div
              className="rounded-xl p-3 flex flex-col gap-3"
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <SummarySection
                icon={<CheckCircle2 className="w-3 h-3" />}
                label="Action Items"
                items={summaryData?.actionItems ?? []}
                color="#34d399"
                emptyLabel="No action items"
              />
              <SummarySection
                icon={<DollarSign className="w-3 h-3" />}
                label="Prices Quoted"
                items={summaryData?.pricesQuoted ?? []}
                color="#fbbf24"
                emptyLabel="No prices"
              />
              <SummarySection
                icon={<CalendarDays className="w-3 h-3" />}
                label="Key Dates"
                items={summaryData?.keyDates ?? []}
                color="#60a5fa"
                emptyLabel="No dates"
              />
            </div>
          )}

          {/* Full transcript toggle */}
          {plainContent.length > 100 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-[11px] font-medium transition-colors w-fit"
              style={{ color: expanded ? "#818cf8" : "#6366f1" }}
            >
              <FileText className="w-3 h-3" />
              {expanded ? "Hide full summary" : "Show full summary"}
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          {expanded && (
            <div
              className="rounded-xl p-3 flex flex-col gap-1"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              {renderMarkdown(plainContent)}
            </div>
          )}
        </div>

        {/* ── Footer */}
        <div
          className="flex items-center gap-1.5 px-4 py-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#7c3aed" }} />
          <span className="text-[10px]" style={{ color: "#4b5563" }}>
            Transcribed by Whisper · Summarized by GPT-4o
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Plain System Note (join/leave events, etc.) ───────────────────────────────

function PlainSystemNote({ content, timestamp }: Pick<SystemNoteProps, "content" | "timestamp">) {
  return (
    <div className="flex justify-center my-3 px-4">
      <div
        className="flex items-center gap-2 rounded-xl px-3.5 py-2 max-w-lg"
        style={{
          background: "rgba(31,41,55,0.6)",
          border: "1px solid rgba(55,65,81,0.5)",
          backdropFilter: "blur(4px)",
        }}
      >
        <Bot className="w-3 h-3 flex-shrink-0" style={{ color: "#6b7280" }} />
        <p className="text-[11px] italic leading-relaxed" style={{ color: "#9ca3af" }}>{content}</p>
        {timestamp && (
          <span className="text-[10px] flex-shrink-0 ml-1" style={{ color: "#374151" }}>{fmtTime(timestamp)}</span>
        )}
      </div>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function SystemNote({ content, timestamp, summaryData }: SystemNoteProps) {
  const isAiSummary =
    summaryData !== undefined ||
    content.includes("Call Summary") ||
    content.includes("Call Audio Transcribed");

  if (isAiSummary) {
    return <AiCallSummaryCard content={content} timestamp={timestamp} summaryData={summaryData} />;
  }
  return <PlainSystemNote content={content} timestamp={timestamp} />;
}
