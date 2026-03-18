"use client";

import { useState, useEffect } from "react";
import { X, Hash, Users, Plus, Check, Search } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userApi, type User } from "@/lib/api";

interface NewWarRoomModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewWarRoomModal({ open, onClose }: NewWarRoomModalProps) {
  const { createWarRoom } = useChatStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Search users as you type
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await userApi.search(searchQuery);
        const users = res.data?.users ?? [];
        // Filter out already selected
        setSearchResults(users.filter(u => !selectedMembers.find(m => m._id === u._id)));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, selectedMembers]);

  const addMember = (user: User) => {
    setSelectedMembers(prev => [...prev, user]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeMember = (userId: string) => {
    setSelectedMembers(prev => prev.filter(m => m._id !== userId));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    await createWarRoom(name.trim(), description.trim(), selectedMembers.map(m => m._id));
    setName("");
    setDescription("");
    setSelectedMembers([]);
    setSearchQuery("");
    setIsCreating(false);
    onClose();
  };

  const slugPreview = name
    ? name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    : "";

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        <div
          className="w-full max-w-md rounded-2xl flex flex-col"
          style={{ background: "#161b22", border: "1px solid #2d3748", boxShadow: "0 25px 60px rgba(0,0,0,0.6)", maxHeight: "85vh" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "#2d3748" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)" }}>
                <Hash className="w-4 h-4" style={{ color: "#3b82f6" }} />
              </div>
              <div>
                <h2 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>New War Room</h2>
                <p className="text-[11px]" style={{ color: "#64748b" }}>Create a project channel for your AEC team</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#64748b" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>War Room Name *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "#3b82f6" }}>#</span>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. site-c-structural-team"
                  className="pl-7 h-9 text-sm border-0"
                  style={{ background: "#1f2937", color: "#f1f5f9", boxShadow: "0 0 0 1px #374151" }}
                  autoFocus
                />
              </div>
              {slugPreview && (
                <p className="text-[11px] mt-1" style={{ color: "#475569" }}>
                  Channel: <code style={{ color: "#3b82f6" }}>#{slugPreview}</code>
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>
                Description <span style={{ color: "#475569", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What's this War Room for?"
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-[#3b82f6]"
                style={{ background: "#1f2937", color: "#f1f5f9", border: "none", boxShadow: "0 0 0 1px #374151" }}
              />
            </div>

            {/* Member search */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                <label className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
                  Add Members{selectedMembers.length > 0 && <span style={{ color: "#3b82f6" }}> ({selectedMembers.length} selected)</span>}
                </label>
              </div>

              {/* Selected members chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedMembers.map(user => (
                    <div
                      key={user._id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                      style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#93c5fd" }}
                    >
                      <span>{user.displayName || user.username}</span>
                      <button onClick={() => removeMember(user._id)} className="hover:opacity-70">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#64748b" }} />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search team members by name..."
                  className="pl-8 h-9 text-sm border-0"
                  style={{ background: "#1f2937", color: "#f1f5f9", boxShadow: "0 0 0 1px #374151" }}
                />
              </div>

              {/* Search results */}
              {isSearching && (
                <p className="text-xs mt-2" style={{ color: "#64748b" }}>Searching...</p>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {searchResults.map(user => (
                    <button
                      key={user._id}
                      onClick={() => addMember(user)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl transition-colors text-left hover:bg-white/5"
                      style={{ background: "#1f2937" }}
                    >
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center font-semibold text-[11px] text-white flex-shrink-0"
                        style={{ background: "#3b82f6" }}
                      >
                        {(user.displayName || user.username).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: "#f1f5f9" }}>{user.displayName || user.username}</p>
                        <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{user.email}</p>
                      </div>
                      <Plus className="w-4 h-4 flex-shrink-0" style={{ color: "#3b82f6" }} />
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                <p className="text-xs mt-2" style={{ color: "#64748b" }}>No users found. Invite them via the admin panel first.</p>
              )}
              {searchQuery.length > 0 && searchQuery.length < 2 && (
                <p className="text-[11px] mt-1" style={{ color: "#475569" }}>Type at least 2 characters to search</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t flex-shrink-0" style={{ borderColor: "#2d3748" }}>
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#94a3b8" }}>
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-lg transition-all"
              style={{
                background: name.trim() ? "#3b82f6" : "#1f2937",
                color: name.trim() ? "#fff" : "#374151",
                cursor: name.trim() ? "pointer" : "not-allowed",
                boxShadow: name.trim() ? "0 4px 12px rgba(59,130,246,0.35)" : "none",
              }}
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "transparent" }} />
                  Creating…
                </>
              ) : (
                <><Plus className="w-4 h-4" />Create War Room</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
