"use client";

import { useState } from "react";
import { X, ExternalLink, Plus } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { Input } from "@/components/ui/input";

interface NewExternalChatModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewExternalChatModal({ open, onClose }: NewExternalChatModalProps) {
  const { createWarRoom } = useChatStore();
  const [form, setForm] = useState({
    contactName: "",
    company: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.contactName.trim()) return;
    setCreating(true);
    const name = form.company
      ? `${form.contactName} (${form.company})`
      : form.contactName;
    // External chats are group conversations with type external
    // We create them as war rooms with a special name
    await createWarRoom(name, form.description || `External chat with ${form.contactName}`, []);
    setForm({ contactName: "", company: "", description: "" });
    setCreating(false);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        <div className="w-full max-w-md rounded-2xl flex flex-col" style={{ background: "#161b22", border: "1px solid #2d3748", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "#2d3748" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)" }}>
                <ExternalLink className="w-4 h-4" style={{ color: "#22c55e" }} />
              </div>
              <div>
                <h2 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>New External Chat</h2>
                <p className="text-[11px]" style={{ color: "#64748b" }}>For vendors, clients, and contacts without an Employee ID</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#64748b" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", color: "#4ade80" }}>
              External chats are for people outside your company — vendors, clients, contractors. They do not have an Employee ID.
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Contact Name *</label>
              <Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                placeholder="e.g. Ramesh Agarwal" className="h-9 text-sm border-0" style={{ background: "#1f2937", color: "#f1f5f9", boxShadow: "0 0 0 1px #374151" }} autoFocus />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Company <span style={{ color: "#475569" }}>(optional)</span></label>
              <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="e.g. BuildRight Contractors" className="h-9 text-sm border-0" style={{ background: "#1f2937", color: "#f1f5f9", boxShadow: "0 0 0 1px #374151" }} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Notes <span style={{ color: "#475569" }}>(optional)</span></label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Concrete supplier for Block A" rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
                style={{ background: "#1f2937", color: "#f1f5f9", border: "none", boxShadow: "0 0 0 1px #374151" }} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t flex-shrink-0" style={{ borderColor: "#2d3748" }}>
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg hover:bg-white/5" style={{ color: "#94a3b8" }}>Cancel</button>
            <button onClick={handleCreate} disabled={!form.contactName.trim() || creating}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-lg transition-all"
              style={{ background: form.contactName.trim() ? "#22c55e" : "#1f2937", color: form.contactName.trim() ? "#052e16" : "#374151", cursor: form.contactName.trim() ? "pointer" : "not-allowed", boxShadow: form.contactName.trim() ? "0 4px 12px rgba(34,197,94,0.3)" : "none" }}>
              {creating ? (
                <><span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "rgba(5,46,22,0.3)", borderTopColor: "transparent" }} />Creating…</>
              ) : (
                <><Plus className="w-4 h-4" />Start Chat</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
