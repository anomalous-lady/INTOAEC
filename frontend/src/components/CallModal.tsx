"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from "lucide-react";
import { callApi } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface CallModalProps {
  conversationId: string;
  callType: "audio" | "video";
  mode: "outgoing" | "incoming";
  remoteUser: { name: string; initials: string; avatarColor: string };
  roomId?: string;
  offer?: RTCSessionDescriptionInit;
  callerId?: string;
  targetUserId?: string;
  onClose: () => void;
}

export function CallModal({
  conversationId, callType, mode, remoteUser,
  roomId: initialRoomId, offer, callerId, targetUserId, onClose
}: CallModalProps) {
  const [callStatus, setCallStatus] = useState<"ringing" | "connected" | "ended">(
    mode === "incoming" ? "ringing" : "ringing"
  );
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [roomId, setRoomId] = useState(initialRoomId ?? "");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
  }, []);

  const startDurationTimer = () => {
    durationTimerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };

  // Accept an explicit roomId arg so the onicecandidate closure is never stale.
  // (Calling createPeerConnection before setRoomId triggers a re-render means
  //  the captured `roomId` state would be "" for outgoing calls.)
  const createPeerConnection = useCallback((activeRoomId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const socket = getSocket();
        const targetId = mode === "outgoing" ? (targetUserId ?? "") : (callerId ?? "");
        socket?.emit("webrtc:ice-candidate", { targetUserId: targetId, candidate: e.candidate.toJSON(), roomId: activeRoomId });
      }
    };

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      setCallStatus("connected");
      startDurationTimer();
    };

    pcRef.current = pc;
    return pc;
  }, [callerId, targetUserId, mode]);

  // Setup socket listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on("webrtc:call-answered", async ({ answer }) => {
      if (pcRef.current?.signalingState !== "have-local-offer") return; // Ignore stale or duplicate answers in strict mode
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallStatus("connected");
        startDurationTimer();
      } catch (err) {
        console.error("Failed to set remote answer:", err);
      }
    });

    socket.on("webrtc:ice-candidate", async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    });

    socket.on("webrtc:call-ended", () => {
      setCallStatus("ended");
      cleanup();
      setTimeout(onClose, 1500);
    });

    socket.on("webrtc:call-rejected", () => {
      setCallStatus("ended");
      cleanup();
      setTimeout(onClose, 1500);
    });

    return () => {
      socket.off("webrtc:call-answered");
      socket.off("webrtc:ice-candidate");
      socket.off("webrtc:call-ended");
      socket.off("webrtc:call-rejected");
    };
  }, [cleanup, onClose]);

  // Start outgoing call
  useEffect(() => {
    if (mode !== "outgoing") return;
    // Track the roomId locally so the cleanup function can always end the correct call,
    // even if setRoomId hasn't re-rendered yet.
    let activeRoomId = "";
    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Camera/Microphone access requires a secure connection (HTTPS or localhost).");
          setCallStatus("ended");
          setTimeout(onClose, 1000);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === "video",
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const res = await callApi.initiate(conversationId, callType);
        if (cancelled) return;

        const newRoomId = res.data!.call.roomId;
        activeRoomId = newRoomId;           // save locally for cleanup
        setRoomId(newRoomId);               // update state for UI / hangUp

        const pc = createPeerConnection(newRoomId); // pass roomId explicitly
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        const offerSDP = await pc.createOffer();
        await pc.setLocalDescription(offerSDP);

        const socket = getSocket();
        socket?.emit("webrtc:call-user", { targetUserId: targetUserId ?? "", roomId: newRoomId, offer: offerSDP, callType });
      } catch (err) {
        if (cancelled) return;
        console.error("Call setup failed:", err);
        setCallStatus("ended");
        setTimeout(onClose, 1000);
      }
    })();

    return () => {
      cancelled = true;
      // Stop media + close PC
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      // End the DB call record so it doesn't get stuck as "ringing"
      if (activeRoomId) {
        callApi.end(activeRoomId, 'normal').catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Answer incoming call
  useEffect(() => {
    if (mode !== "incoming" || !offer) return;
    let isCancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Camera/Microphone access requires a secure connection (HTTPS or localhost).");
          setCallStatus("ended");
          setTimeout(onClose, 1000);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === "video",
          audio: true,
        });
        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Use initialRoomId (prop) for the PC since roomId state may not be set yet
        const activeRoomId = initialRoomId ?? roomId;
        const pc = createPeerConnection(activeRoomId);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        if (isCancelled) return;

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const socket = getSocket();
        socket?.emit("webrtc:call-answer", { callerId: callerId!, roomId: activeRoomId, answer });
        setCallStatus("connected");
        startDurationTimer();
      } catch (err) {
        console.error("Answer failed:", err);
      }
    })();
    return () => {
      isCancelled = true;
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hangUp = async () => {
    setCallStatus("ended");
    if (roomId) {
      const socket = getSocket();
      // Emit the socket signal BEFORE the REST API ends the call in the database,
      // otherwise the backend socket handler won't find the active call and won't notify the peer!
      socket?.emit("webrtc:end-call", { roomId });
      
      try { await callApi.end(roomId); } catch {}
    }
    cleanup();
    setTimeout(onClose, 500);
  };

  const rejectCall = async () => {
    if (roomId) {
      const socket = getSocket();
      socket?.emit("webrtc:reject-call", { callerId: callerId!, roomId });
      
      try { await callApi.reject(roomId); } catch {}
    }
    onClose();
  };

  const acceptCall = () => {
    // Already handled in useEffect above when mode=incoming
    // Just update UI — stream setup happens automatically
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCamOff(c => !c);
  };

  const fmtDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <div className="relative w-full max-w-md rounded-3xl overflow-hidden flex flex-col" style={{ background: "#0f1117", border: "1px solid #2d3748", minHeight: 480 }}>

        {/* Remote video / avatar */}
        <div className="relative flex-1 flex items-center justify-center" style={{ background: "#161b22", minHeight: 320 }}>
          {callType === "video" ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ minHeight: 320 }} />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-white text-3xl font-bold" style={{ background: remoteUser.avatarColor }}>
                {remoteUser.initials}
              </div>
              <p className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>{remoteUser.name}</p>
            </div>
          )}

          {/* Local video pip */}
          {callType === "video" && (
            <div className="absolute bottom-3 right-3 w-24 h-32 rounded-xl overflow-hidden border-2" style={{ borderColor: "#2d3748" }}>
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}

          {/* Status badge */}
          <div className="absolute top-4 left-0 right-0 flex justify-center">
            <div className="px-4 py-1.5 rounded-full text-sm font-medium" style={{
              background: callStatus === "connected" ? "rgba(34,197,94,0.2)" : callStatus === "ended" ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.2)",
              color: callStatus === "connected" ? "#22c55e" : callStatus === "ended" ? "#ef4444" : "#3b82f6",
              border: `1px solid ${callStatus === "connected" ? "rgba(34,197,94,0.4)" : callStatus === "ended" ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.4)"}`,
            }}>
              {callStatus === "ringing" && mode === "outgoing" ? "Calling…" :
               callStatus === "ringing" && mode === "incoming" ? "Incoming call" :
               callStatus === "connected" ? fmtDuration(duration) :
               "Call ended"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-6 py-6" style={{ background: "#0f1117" }}>
          {/* Incoming call — accept/reject */}
          {callStatus === "ringing" && mode === "incoming" ? (
            <>
              <button onClick={rejectCall} className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105" style={{ background: "#ef4444" }}>
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <button onClick={acceptCall} className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105" style={{ background: "#22c55e" }}>
                <Phone className="w-6 h-6 text-white" />
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleMute} className="w-12 h-12 rounded-full flex items-center justify-center transition-all" style={{ background: isMuted ? "rgba(239,68,68,0.2)" : "#1f2937", color: isMuted ? "#ef4444" : "#94a3b8" }}>
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              {callType === "video" && (
                <button onClick={toggleCam} className="w-12 h-12 rounded-full flex items-center justify-center transition-all" style={{ background: isCamOff ? "rgba(239,68,68,0.2)" : "#1f2937", color: isCamOff ? "#ef4444" : "#94a3b8" }}>
                  {isCamOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              )}
              <button onClick={hangUp} className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105" style={{ background: "#ef4444" }}>
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
