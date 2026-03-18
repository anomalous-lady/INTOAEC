"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Paperclip, Send, X, FileText, Mic, MicOff, Square } from "lucide-react";
import { useChatStore } from "@/store/chatStore";

export function ChatInput() {
  const { selectedRoomId, sendMessage, sendFileMessage } = useChatStore();
  const [text, setText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [text]);

  const canSend = text.trim().length > 0 || attachedFiles.length > 0;

  const handleSend = useCallback(async () => {
    if (!selectedRoomId) return;
    if (attachedFiles.length > 0) {
      await sendFileMessage(selectedRoomId, attachedFiles);
      setAttachedFiles([]);
      setPreviewUrls([]);
    }
    if (text.trim()) {
      sendMessage(text.trim(), "text");
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  }, [selectedRoomId, text, attachedFiles, sendMessage, sendFileMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setAttachedFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        setPreviewUrls(prev => [...prev, url]);
      } else {
        setPreviewUrls(prev => [...prev, ""]);
      }
    });
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        if (selectedRoomId) await sendFileMessage(selectedRoomId, [file]);
      };
      mr.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      alert("Microphone access denied. Please allow microphone in browser settings.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingSeconds(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingSeconds(0);
  };

  const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!selectedRoomId) return null;

  return (
    <div className="px-4 pb-4 pt-2 flex-shrink-0" style={{ background: "#0f1117" }}>
      {/* Attachment previews */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachedFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
              {previewUrls[idx] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrls[idx]} alt="preview" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(239,68,68,0.15)" }}>
                  <FileText className="w-5 h-5" style={{ color: "#ef4444" }} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate max-w-[120px]" style={{ color: "#f1f5f9" }}>{file.name}</p>
                <p className="text-[11px]" style={{ color: "#64748b" }}>{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={() => removeFile(idx)} className="p-1 rounded hover:bg-white/5" style={{ color: "#64748b" }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="mb-2 flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "#161b22", border: "1px solid rgba(239,68,68,0.4)" }}>
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-sm font-medium" style={{ color: "#f1f5f9" }}>Recording voice note…</span>
          <span className="text-sm font-mono ml-auto" style={{ color: "#ef4444" }}>{fmtSecs(recordingSeconds)}</span>
          <button onClick={cancelRecording} className="text-xs px-2 py-1 rounded" style={{ color: "#64748b", background: "#1f2937" }}>Cancel</button>
          <button onClick={stopRecording} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#ef4444", color: "#fff" }}>
            <Square className="w-3 h-3" />Send
          </button>
        </div>
      )}

      {/* Composer */}
      {!isRecording && (
        <div
          className="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{ background: "#161b22", border: "1px solid #2d3748", transition: "box-shadow 0.15s ease" }}
          onFocus={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 1px rgba(59,130,246,0.4)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(59,130,246,0.5)"; }}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; (e.currentTarget as HTMLDivElement).style.borderColor = "#2d3748"; } }}
        >
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" multiple onChange={handleFileChange} />
          <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0 mb-0.5 transition-colors" style={{ color: "#64748b" }} title="Attach file">
            <Paperclip className="w-4 h-4" />
          </button>
          <button onClick={startRecording} className="p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0 mb-0.5 transition-colors" style={{ color: "#64748b" }} title="Record voice note">
            <Mic className="w-4 h-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the team… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm outline-none border-0 py-1.5 placeholder:text-[#475569] leading-relaxed"
            style={{ color: "#f1f5f9", minHeight: 36, maxHeight: 120, scrollbarWidth: "none" }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="p-2 rounded-lg flex-shrink-0 mb-0.5 transition-all"
            style={{ background: canSend ? "#3b82f6" : "#1f2937", color: canSend ? "#fff" : "#374151", cursor: canSend ? "pointer" : "not-allowed", boxShadow: canSend ? "0 2px 8px rgba(59,130,246,0.35)" : "none" }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      <p className="text-center text-[10px] mt-2" style={{ color: "#37415180" }}>
        IntoAEC internal communications are end-to-end encrypted and stored natively.
      </p>
    </div>
  );
}
