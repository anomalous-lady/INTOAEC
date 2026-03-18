"use client";

import { useState, useMemo, useEffect } from "react";
import { Hash, MessageSquare, Plus, Search, ChevronRight, ChevronDown, Users, Inbox, ExternalLink, X, UserSearch } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewWarRoomModal } from "./NewWarRoomModal";
import { NewExternalChatModal } from "./NewExternalChatModal";
import { cn } from "@/lib/utils";
import { userApi, type User as ApiUser } from "@/lib/api";

function Avatar({ initials, color, size = 28, online }: { initials: string; color: string; size?: number; online?: boolean }) {
  return (
    <div className="relative flex-shrink-0">
      <div className="avatar-initials text-white" style={{ background: color, width: size, height: size, fontSize: size <= 28 ? 10 : 12, borderRadius: 6 }}>
        {initials}
      </div>
      {online !== undefined && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full border" style={{ width: 7, height: 7, background: online ? "#22c55e" : "#6b7280", borderColor: "#161b22", borderWidth: 1.5 }} />
      )}
    </div>
  );
}

export function Sidebar() {
  const { rooms, users, selectedRoomId, selectRoom, sidebarOpen, setSidebarOpen, sidebarSearch, setSidebarSearch, internalExpanded, setInternalExpanded, externalExpanded, setExternalExpanded, startDM, currentUserId } = useChatStore();
  const { user: currentUser } = useAuthStore();

  const [warRoomModalOpen, setWarRoomModalOpen] = useState(false);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState("");
  const [dmSearchResults, setDmSearchResults] = useState<ApiUser[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const [showDmSearch, setShowDmSearch] = useState(false);

  useEffect(() => {
    if (selectedRoomId && window.innerWidth < 768) setSidebarOpen(false);
  }, [selectedRoomId, setSidebarOpen]);

  // Employee ID / name DM search
  useEffect(() => {
    if (dmSearchQuery.trim().length < 2) { setDmSearchResults([]); return; }
    const t = setTimeout(async () => {
      setDmSearching(true);
      try {
        const res = await userApi.search(dmSearchQuery);
        setDmSearchResults(res.data?.users ?? []);
      } catch { setDmSearchResults([]); }
      finally { setDmSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [dmSearchQuery]);

  const q = sidebarSearch.toLowerCase();
  const dms = useMemo(() => rooms.filter(r => r.type === "dm" && (!q || r.name.toLowerCase().includes(q))), [rooms, q]);
  const warRooms = useMemo(() => rooms.filter(r => r.type === "warroom" && (!q || r.name.toLowerCase().includes(q))), [rooms, q]);
  const externalChats = useMemo(() => rooms.filter(r => r.type === "external" && (!q || r.name.toLowerCase().includes(q))), [rooms, q]);
  const totalInternalUnread = useMemo(() => [...dms, ...warRooms].reduce((a, r) => a + r.unreadCount, 0), [dms, warRooms]);
  const totalExternalUnread = useMemo(() => externalChats.reduce((a, r) => a + r.unreadCount, 0), [externalChats]);

  const getUserForDm = (room: typeof rooms[0]) => {
    const otherId = room.memberIds.find(id => id !== currentUserId && id !== currentUser?._id);
    return users.find(u => u.id === otherId);
  };

  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside
        className={cn("fixed md:relative z-50 md:z-auto flex flex-col h-full border-r transition-transform duration-200 ease-in-out md:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")}
        style={{ width: 280, background: "#161b22", borderColor: "#2d3748", flexShrink: 0 }}
      >
        {/* Workspace header */}
        <div className="flex items-center justify-between px-4 h-14 border-b flex-shrink-0" style={{ borderColor: "#2d3748" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs text-white" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>IA</div>
            <div className="flex flex-col leading-none">
              <span className="font-semibold text-sm text-[#f1f5f9]">IntoAEC</span>
              <span className="text-[10px] text-[#64748b]">Workspace</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 rounded hover:bg-white/5 text-[#64748b]"><X className="w-4 h-4" /></button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#64748b" }} />
            <Input placeholder="Search chats…" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)}
              className="pl-8 h-8 text-xs border-0" style={{ background: "#1f2937", color: "#f1f5f9", boxShadow: "0 0 0 1px #2d3748" }} />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "thin" }}>

          {/* ── INTERNAL CHATS ── */}
          <div className="mb-1">
            <button onClick={() => setInternalExpanded(!internalExpanded)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md hover:bg-white/5 mt-1"
              style={{ color: "#94a3b8" }}>
              {internalExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span className="flex-1 text-left">Internal Chats</span>
              {!internalExpanded && totalInternalUnread > 0 && (
                <Badge className="h-4 px-1 text-[10px] font-bold" style={{ background: "#3b82f6", color: "#fff" }}>{totalInternalUnread}</Badge>
              )}
            </button>

            {internalExpanded && (
              <div className="mt-0.5">
                {totalInternalUnread > 0 && (
                  <div className="chat-row" style={{ color: "#94a3b8" }}>
                    <Inbox className="w-4 h-4 flex-shrink-0" style={{ color: "#64748b" }} />
                    <span className="flex-1 text-xs">All unreads</span>
                    <Badge className="h-4 px-1.5 text-[10px] font-bold" style={{ background: "#ef4444", color: "#fff" }}>{totalInternalUnread}</Badge>
                  </div>
                )}

                {/* DMs header with New DM button */}
                <div className="px-2 pt-3 pb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>Direct Messages</span>
                  <button onClick={() => setShowDmSearch(v => !v)} className="p-0.5 rounded hover:bg-white/5 transition-colors" style={{ color: "#64748b" }} title="New DM — search by Employee ID or name">
                    <UserSearch className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Employee ID / name search for DM */}
                {showDmSearch && (
                  <div className="mx-1 mb-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: "#64748b" }} />
                      <input value={dmSearchQuery} onChange={e => setDmSearchQuery(e.target.value)}
                        placeholder="Employee ID or name…"
                        className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none"
                        style={{ background: "#1f2937", color: "#f1f5f9", border: "1px solid #374151" }}
                        autoFocus />
                    </div>
                    {dmSearching && <p className="text-[11px] px-2 py-1" style={{ color: "#64748b" }}>Searching…</p>}
                    {dmSearchResults.map(user => (
                      <button key={user._id} onClick={async () => { await startDM(user._id); setShowDmSearch(false); setDmSearchQuery(""); setDmSearchResults([]); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: "#3b82f6" }}>
                          {(user.displayName || user.username).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate" style={{ color: "#f1f5f9" }}>{user.displayName || user.username}</p>
                          {user.employeeId && <p className="text-[10px] font-mono" style={{ color: "#3b82f6" }}>{user.employeeId}</p>}
                        </div>
                      </button>
                    ))}
                    {dmSearchQuery.length >= 2 && !dmSearching && dmSearchResults.length === 0 && (
                      <p className="text-[11px] px-2 py-1" style={{ color: "#64748b" }}>No employees found</p>
                    )}
                  </div>
                )}

                {dms.length === 0 && !showDmSearch && <p className="px-3 py-1 text-xs" style={{ color: "#475569" }}>No DMs yet — click <UserSearch className="w-3 h-3 inline" /> to start one</p>}

                {dms.map(room => {
                  const user = getUserForDm(room);
                  const isActive = selectedRoomId === room.id;
                  return (
                    <button key={room.id} onClick={() => selectRoom(room.id)} className={cn("chat-row w-full text-left", isActive && "active")}>
                      {user ? <Avatar initials={user.initials} color={user.avatarColor} online={user.isOnline} /> :
                        <div className="w-7 h-7 rounded-md flex-shrink-0" style={{ background: "#374151" }} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate" style={{ color: isActive ? "#3b82f6" : room.unreadCount > 0 ? "#f1f5f9" : "#94a3b8", fontWeight: room.unreadCount > 0 ? 600 : 400 }}>{room.name}</span>
                          <span className="text-[10px] ml-1 flex-shrink-0" style={{ color: "#475569" }}>{room.lastMessageTime}</span>
                        </div>
                        <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{room.lastMessage}</p>
                      </div>
                      {room.unreadCount > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px] font-bold flex-shrink-0" style={{ background: "#3b82f6", color: "#fff" }}>{room.unreadCount}</Badge>}
                    </button>
                  );
                })}

                {/* War Rooms */}
                <div className="px-2 pt-3 pb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>War Rooms</span>
                  <Button variant="ghost" size="icon" onClick={() => setWarRoomModalOpen(true)} className="h-5 w-5 hover:bg-white/5 rounded" style={{ color: "#64748b" }} title="New War Room">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {warRooms.length === 0 && <p className="px-3 py-1 text-xs" style={{ color: "#475569" }}>No War Rooms yet</p>}
                {warRooms.map(room => {
                  const isActive = selectedRoomId === room.id;
                  return (
                    <button key={room.id} onClick={() => selectRoom(room.id)} className={cn("chat-row w-full text-left", isActive && "active")}>
                      <Hash className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? "#3b82f6" : "#64748b" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs truncate" style={{ color: isActive ? "#3b82f6" : room.unreadCount > 0 ? "#f1f5f9" : "#94a3b8", fontWeight: room.unreadCount > 0 ? 600 : 400 }}>{room.name}</span>
                        </div>
                        <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{room.lastMessage}</p>
                      </div>
                      {room.unreadCount > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px] font-bold flex-shrink-0" style={{ background: "#3b82f6", color: "#fff" }}>{room.unreadCount}</Badge>}
                    </button>
                  );
                })}

                <button onClick={() => setWarRoomModalOpen(true)} className="chat-row w-full text-left mt-1" style={{ color: "#64748b" }}>
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#1f2937" }}><Plus className="w-3 h-3" /></div>
                  <span className="text-xs">New War Room</span>
                </button>
              </div>
            )}
          </div>

          <div className="my-2 mx-2 border-t" style={{ borderColor: "#2d3748" }} />

          {/* ── EXTERNAL CHATS ── */}
          <div>
            <button onClick={() => setExternalExpanded(!externalExpanded)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md hover:bg-white/5" style={{ color: "#22c55e" }}>
              {externalExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <ExternalLink className="w-3 h-3" />
              <span className="flex-1 text-left">External Chats</span>
              {!externalExpanded && totalExternalUnread > 0 && <Badge className="h-4 px-1 text-[10px] font-bold" style={{ background: "#22c55e", color: "#052e16" }}>{totalExternalUnread}</Badge>}
            </button>

            {externalExpanded && (
              <div className="mt-0.5">
                {externalChats.length === 0 && <p className="px-3 py-1 text-xs" style={{ color: "#475569" }}>No external chats yet</p>}
                {externalChats.map(room => {
                  const isActive = selectedRoomId === room.id;
                  return (
                    <button key={room.id} onClick={() => selectRoom(room.id)} className="chat-row w-full text-left border-l-2" style={{ background: isActive ? "rgba(34,197,94,0.1)" : undefined, borderLeftColor: "#22c55e", paddingLeft: 10 }}>
                      <MessageSquare className="w-4 h-4 flex-shrink-0" style={{ color: "#22c55e" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate" style={{ color: room.unreadCount > 0 ? "#f1f5f9" : "#94a3b8", fontWeight: room.unreadCount > 0 ? 600 : 400 }}>{room.name}</span>
                          <span className="text-[10px]" style={{ color: "#475569" }}>{room.lastMessageTime}</span>
                        </div>
                        <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{room.lastMessage}</p>
                      </div>
                      {room.unreadCount > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px] font-bold flex-shrink-0" style={{ background: "#22c55e", color: "#052e16" }}>{room.unreadCount}</Badge>}
                    </button>
                  );
                })}

                <button onClick={() => setExternalModalOpen(true)} className="chat-row w-full text-left mt-1" style={{ color: "#22c55e" }}>
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.1)" }}><Plus className="w-3 h-3" /></div>
                  <span className="text-xs">New External Chat</span>
                </button>

                <div className="mx-2 mt-3 p-2.5 rounded-lg text-[11px]" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", color: "#4ade80" }}>
                  <div className="flex items-center gap-1.5 mb-1 font-semibold"><Users className="w-3 h-3" />External contacts only</div>
                  <p style={{ color: "#6b7280" }}>For vendors, clients, and contacts without an Employee ID</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: current user */}
        <div className="px-3 py-3 border-t flex items-center gap-2.5 flex-shrink-0" style={{ borderColor: "#2d3748", background: "#0f1117" }}>
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs text-white" style={{ background: "#3b82f6" }}>
              {(currentUser?.displayName || currentUser?.username || "?").slice(0, 2).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" style={{ background: "#22c55e", borderColor: "#0f1117" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "#f1f5f9" }}>{currentUser?.displayName || currentUser?.username}</p>
            {currentUser?.employeeId && <p className="text-[10px] font-mono" style={{ color: "#3b82f6" }}>{currentUser.employeeId}</p>}
          </div>
        </div>
      </aside>

      <NewWarRoomModal open={warRoomModalOpen} onClose={() => setWarRoomModalOpen(false)} />
      <NewExternalChatModal open={externalModalOpen} onClose={() => setExternalModalOpen(false)} />
    </>
  );
}
