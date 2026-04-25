"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Loader2, Volume2, VolumeX,
  Wifi, WifiOff, Radio, Sparkles, X
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

// ── Types ─────────────────────────────────────────────────────────────────────

type CallStatus =
  | "idle"
  | "fetching-token"
  | "logging-in"
  | "calling"
  | "ringing"
  | "active"
  | "ended"
  | "failed"
  | "ai-processing";

interface PlivoDialerProps {
  conversationId: string;
  phoneNumber: string;
  open: boolean;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getStatusLabel(status: CallStatus): string {
  switch (status) {
    case "fetching-token": return "Connecting…";
    case "logging-in":    return "Authenticating…";
    case "calling":       return "Calling…";
    case "ringing":       return "Ringing…";
    case "active":        return "Connected";
    case "ended":         return "Call Ended";
    case "failed":        return "Call Failed";
    case "ai-processing": return "Processing AI Summary…";
    default:              return "Initializing…";
  }
}

function getStatusColor(status: CallStatus): string {
  if (status === "active") return "#22c55e";
  if (status === "ended" || status === "failed") return "#ef4444";
  if (status === "ai-processing") return "#a855f7";
  return "#94a3b8";
}

// ── Sound wave animation bars ─────────────────────────────────────────────────
function SoundWave({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-6" style={{ opacity: active ? 1 : 0.3 }}>
      {[3, 5, 7, 5, 8, 4, 6, 3, 7, 5, 4, 6].map((h, i) => (
        <div
          key={i}
          className="w-0.5 rounded-full"
          style={{
            height: active ? `${h * 3}px` : "4px",
            background: "linear-gradient(to top, #3b82f6, #8b5cf6)",
            animation: active ? `soundBar ${0.4 + i * 0.07}s ease-in-out infinite alternate` : "none",
            animationDelay: `${i * 50}ms`,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

// ── Ripple ring for ringing state ─────────────────────────────────────────────
function RippleRing() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full border"
          style={{
            width: `${100 + i * 40}px`,
            height: `${100 + i * 40}px`,
            borderColor: "rgba(59,130,246,0.3)",
            animation: `ripple 2s ease-out infinite`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────
function ControlBtn({
  onClick, disabled, active, danger, icon, label,
  size = "md",
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
  label: string;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "w-16 h-16" : "w-12 h-12";
  let bg = "rgba(255,255,255,0.06)";
  let color = "#94a3b8";
  if (danger) { bg = "#dc2626"; color = "#fff"; }
  else if (active) { bg = "rgba(239,68,68,0.18)"; color = "#ef4444"; }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`${dim} rounded-full flex flex-col items-center justify-center gap-1 transition-all
        hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
      style={{ background: bg, color, border: `1px solid rgba(255,255,255,0.08)` }}
    >
      {icon}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlivoDialer({ conversationId, phoneNumber, open, onClose }: PlivoDialerProps) {
  const { user } = useAuthStore();

  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted]         = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [duration, setDuration]       = useState(0);
  const [sdkError, setSdkError]       = useState<string | null>(null);

  const plivoRef        = useRef<any>(null);
  const durationRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimer = useCallback(() => {
    setDuration(0);
    durationRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    stopTimer();
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    try {
      plivoRef.current?.client?.hangup();
      plivoRef.current?.client?.logout();
    } catch (_) {}
    plivoRef.current = null;
  }, [stopTimer]);

  // ── SDK setup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    setSdkError(null);
    setCallStatus("fetching-token");
    setIsMuted(false);
    setIsSpeakerOff(false);
    setDuration(0);

    const setup = async () => {
      try {
        // 1. Fetch JWT from backend
        const res = await api.get<{ data: { token: string } }>("/voice/plivo/token");
        const token = res.data?.data?.token;
        if (!token) throw new Error("No token received from server");

        // 2. Verify Plivo Browser SDK is loaded via CDN (layout.tsx injects the script)
        if (typeof window === "undefined" || !(window as any).Plivo) {
          throw new Error("Plivo Browser SDK not loaded. Check your network connection.");
        }

        setCallStatus("logging-in");

        // 3. Instantiate Plivo Browser SDK v2
        //    Constructor: new Plivo(options) — the .client property holds all methods/events
        const plivoWebSdk = new (window as any).Plivo({
          debug: "ERROR",
          permOnClick: true,
          codecs: ["OPUS", "PCMU"],
          enableIPV6: false,
          audioConstraints: { optional: [{ googAutoGainControl: false }] },
          dscp: true,
          enableTracking: false,
        });

        plivoRef.current = plivoWebSdk;

        // ── Event bindings ──────────────────────────────────────────────────
        plivoWebSdk.client.on("onLogin", () => {
          setCallStatus("calling");

          // Pass conversationId & userId via SIP X-PH- custom headers
          const extraHeaders: Record<string, string> = {
            "X-PH-conversationid": conversationId,
          };
          if (user?._id) extraHeaders["X-PH-userid"] = user._id;

          // Make the call to the destination number
          plivoWebSdk.client.call(phoneNumber, extraHeaders);
        });

        plivoWebSdk.client.on("onLoginFailed", (cause: string) => {
          setSdkError(`Login failed: ${cause || "Invalid credentials — check Plivo endpoint config"}`);
          setCallStatus("failed");
          autoCloseRef.current = setTimeout(onClose, 4000);
        });

        plivoWebSdk.client.on("onCalling", () => {
          setCallStatus("calling");
        });

        plivoWebSdk.client.on("onCallRemoteRinging", () => {
          setCallStatus("ringing");
        });

        plivoWebSdk.client.on("onCallAnswered", () => {
          setCallStatus("active");
          startTimer();
        });

        plivoWebSdk.client.on("onCallTerminated", (cause?: string) => {
          stopTimer();
          setCallStatus("ai-processing");
          // The backend will process the recording and push the AI note via socket.
          // Auto-close the dialer after a short waiting period.
          autoCloseRef.current = setTimeout(() => {
            setCallStatus("ended");
            setTimeout(onClose, 1500);
          }, 5000);
        });

        plivoWebSdk.client.on("onCallFailed", (cause: string) => {
          stopTimer();
          setSdkError(cause ? `Call failed: ${cause}` : "Call failed — please retry");
          setCallStatus("failed");
          autoCloseRef.current = setTimeout(onClose, 4000);
        });

        plivoWebSdk.client.on("onMediaPermissionError", () => {
          setSdkError("Microphone permission denied. Please allow mic access in your browser.");
          setCallStatus("failed");
        });

        plivoWebSdk.client.on("onConnectionChange", ({ state }: { state: string }) => {
          // state can be: 'connected', 'disconnected', 'connecting'
          if (state === "disconnected" && callStatus === "active") {
            stopTimer();
            setSdkError("Network connection lost");
            setCallStatus("failed");
          }
        });

        // 4. Login using JWT token (Plivo Browser SDK v2 JWT auth)
        //    loginWithToken is the JWT-based method; login(user, pass) is SIP-credential auth
        plivoWebSdk.client.loginWithToken(token);

      } catch (err: any) {
        console.error("[PlivoDialer] setup error:", err);
        setSdkError(err?.message || "Failed to connect to calling service");
        setCallStatus("failed");
        autoCloseRef.current = setTimeout(onClose, 4000);
      }
    };

    setup();

    return () => {
      teardown();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleHangup = () => {
    stopTimer();
    try {
      plivoRef.current?.client?.hangup();
    } catch (_) {}
    setCallStatus("ai-processing");
    autoCloseRef.current = setTimeout(() => {
      setCallStatus("ended");
      setTimeout(onClose, 1500);
    }, 5000);
  };

  const handleMuteToggle = () => {
    try {
      if (isMuted) plivoRef.current?.client?.unmute();
      else         plivoRef.current?.client?.mute();
      setIsMuted((prev) => !prev);
    } catch (_) {}
  };

  const handleSpeakerToggle = () => {
    // Plivo SDK doesn't expose a direct speaker API — visual toggle only
    setIsSpeakerOff(!isSpeakerOff);
  };

  // ── Derived flags ─────────────────────────────────────────────────────────
  const isConnecting  = ["fetching-token", "logging-in", "calling", "ringing"].includes(callStatus);
  const isActive      = callStatus === "active";
  const isProcessing  = callStatus === "ai-processing";
  const isTerminal    = ["ended", "failed"].includes(callStatus);

  const statusColor   = getStatusColor(callStatus);
  const formattedNum  = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

  if (!open) return null;

  return (
    <>
      {/* ── Global keyframe styles ─── (injected once) */}
      <style>{`
        @keyframes ripple {
          0%   { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes soundBar {
          0%   { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.4); }
          50%       { box-shadow: 0 0 0 12px rgba(168,85,247,0); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}
      >
        {/* ── Card ──────────────────────────────────────────────────────── */}
        <div
          className="relative w-full max-w-[340px] rounded-3xl overflow-hidden flex flex-col"
          style={{
            background: "linear-gradient(160deg, #1a1f2e 0%, #0f1117 60%, #111827 100%)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 32px 64px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(59,130,246,0.08)",
          }}
        >
          {/* ── Gradient accent top bar ──────────────────────────────────── */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, #3b82f6 40%, #8b5cf6 60%, transparent)" }}
          />

          {/* ── Close button ─────────────────────────────────────────────── */}
          {isTerminal && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center z-10
                hover:bg-white/10 transition-colors"
              style={{ color: "#94a3b8" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* ── Top section: avatar + number ─────────────────────────────── */}
          <div className="relative flex flex-col items-center pt-10 pb-6 px-6">
            {/* Ripple rings when ringing */}
            {callStatus === "ringing" && <RippleRing />}

            {/* Avatar circle */}
            <div
              className="relative w-20 h-20 rounded-2xl flex items-center justify-center mb-5 z-10"
              style={{
                background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))",
                border: `2px solid ${isActive ? "rgba(34,197,94,0.4)" : "rgba(59,130,246,0.2)"}`,
                transition: "border-color 0.4s ease",
                boxShadow: isActive
                  ? "0 0 0 0 rgba(34,197,94,0.4), 0 8px 24px rgba(0,0,0,0.3)"
                  : "0 8px 24px rgba(0,0,0,0.3)",
                animation: isActive ? "pulse-glow 2s ease-in-out infinite" : "none",
              }}
            >
              <Phone
                className="w-9 h-9"
                style={{
                  color: isActive ? "#22c55e" : "#3b82f6",
                  transition: "color 0.4s ease",
                }}
              />
            </div>

            {/* Phone number */}
            <p
              className="text-2xl font-bold tracking-tight mb-1.5 font-mono z-10"
              style={{ color: "#f1f5f9" }}
            >
              {formattedNum}
            </p>

            {/* Status line */}
            <div className="flex items-center gap-2 z-10">
              {isConnecting && (
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: statusColor }} />
              )}
              {isProcessing && (
                <Sparkles
                  className="w-3 h-3"
                  style={{ color: "#a855f7", animation: "spin-slow 3s linear infinite" }}
                />
              )}
              <span
                className="text-sm font-medium tracking-wide"
                style={{ color: statusColor, transition: "color 0.3s ease" }}
              >
                {isActive ? formatDuration(duration) : getStatusLabel(callStatus)}
              </span>
            </div>

            {/* Error message */}
            {sdkError && (
              <p className="mt-2 text-xs text-center z-10 px-2" style={{ color: "#fca5a5" }}>
                {sdkError}
              </p>
            )}
          </div>

          {/* ── Sound wave (visible when active) ─────────────────────────── */}
          <div
            className="flex justify-center transition-all duration-500 overflow-hidden"
            style={{ height: isActive ? "36px" : "0px", marginBottom: isActive ? "8px" : 0 }}
          >
            <SoundWave active={isActive && !isMuted} />
          </div>

          {/* ── Recording badge ───────────────────────────────────────────── */}
          {isActive && (
            <div className="flex justify-center mb-4">
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#fca5a5",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full bg-red-500"
                  style={{ animation: "ripple 1.5s ease-out infinite" }}
                />
                Recording • AI Summary on completion
              </div>
            </div>
          )}

          {/* ── AI processing badge ───────────────────────────────────────── */}
          {isProcessing && (
            <div className="flex justify-center mb-4 px-6">
              <div
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs"
                style={{
                  background: "rgba(168,85,247,0.08)",
                  border: "1px solid rgba(168,85,247,0.2)",
                }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(168,85,247,0.2)" }}
                >
                  <Sparkles className="w-3 h-3" style={{ color: "#a855f7" }} />
                </div>
                <div>
                  <p className="font-medium" style={{ color: "#d8b4fe" }}>AI is analyzing your call…</p>
                  <p style={{ color: "#7c3aed" }}>Transcript + summary will appear in chat</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Divider ───────────────────────────────────────────────────── */}
          <div style={{ height: "1px", background: "rgba(255,255,255,0.05)", margin: "0 24px" }} />

          {/* ── Control buttons ───────────────────────────────────────────── */}
          {!isTerminal && (
            <div className="flex items-center justify-center gap-5 px-6 py-6">
              {/* Mute */}
              <ControlBtn
                onClick={handleMuteToggle}
                disabled={!isActive}
                active={isMuted}
                icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                label={isMuted ? "Unmute" : "Mute"}
              />

              {/* Hang up — big red button */}
              <ControlBtn
                onClick={handleHangup}
                disabled={isTerminal || isProcessing}
                danger
                size="lg"
                icon={<PhoneOff className="w-6 h-6" />}
                label="End call"
              />

              {/* Speaker */}
              <ControlBtn
                onClick={handleSpeakerToggle}
                disabled={!isActive}
                active={isSpeakerOff}
                icon={isSpeakerOff ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                label={isSpeakerOff ? "Unmute speaker" : "Mute speaker"}
              />
            </div>
          )}

          {/* ── Signal / connection quality ───────────────────────────────── */}
          <div
            className="flex items-center justify-center gap-1.5 pb-4 pt-0"
            style={{ color: "#374151" }}
          >
            {isActive
              ? <><Wifi className="w-3 h-3" style={{ color: "#22c55e" }} /><span className="text-[10px]" style={{ color: "#22c55e" }}>Encrypted · Plivo WebRTC</span></>
              : <><WifiOff className="w-3 h-3" /><span className="text-[10px]">Plivo Softphone</span></>
            }
          </div>
        </div>
      </div>
    </>
  );
}
