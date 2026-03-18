"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, HelpCircle, Menu, Search, Shield, User, Activity, Settings, LogOut, X, ChevronRight, Phone, MessageSquare, Info, BookOpen, Mail } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { type Notification } from "@/data/mockData";

function formatNotifTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function TopBar() {
  const { toggleSidebar, globalSearch, setGlobalSearch, notifications, unreadNotifCount, markNotifsRead, selectRoom } = useChatStore();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const totalUnread = useChatStore(s => s.rooms.reduce((acc, r) => acc + r.unreadCount, 0));

  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const notifsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close panels on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setShowHelp(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openNotifs = () => { setShowNotifs(v => !v); setShowProfile(false); setShowHelp(false); if (!showNotifs) markNotifsRead(); };
  const openProfile = () => { setShowProfile(v => !v); setShowNotifs(false); setShowHelp(false); };
  const openHelp = () => { setShowHelp(v => !v); setShowNotifs(false); setShowProfile(false); };

  const userInitials = user ? (user.displayName || user.username).slice(0, 2).toUpperCase() : "??";

  return (
    <header className="flex items-center h-14 px-4 border-b shrink-0 z-50" style={{ background: "#0f1117", borderColor: "#2d3748", boxShadow: "0 1px 0 0 rgba(255,255,255,0.04)" }}>
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0 mr-4">
        <button onClick={toggleSidebar} className="md:hidden p-1.5 rounded-md hover:bg-white/5 text-[#94a3b8] transition-colors">
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>IA</div>
        <div className="hidden sm:flex flex-col leading-none">
          <span className="font-semibold text-sm text-[#f1f5f9]">IntoAEC</span>
          <span className="text-[10px] text-[#64748b]">Siaratech Solutions</span>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xl mx-auto px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "#64748b" }} />
          <Input value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} placeholder="Search messages, people, files…"
            className="pl-9 h-9 text-sm border-0" style={{ background: "#1f2937", color: "#f1f5f9", boxShadow: "0 0 0 1px #2d3748" }} />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 ml-4">
        {/* Admin */}
        {user?.role === "admin" && (
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-white/5" style={{ color: "#3b82f6" }} title="Admin Panel" onClick={() => router.push("/admin")}>
            <Shield className="w-5 h-5" />
          </Button>
        )}

        {/* Notifications */}
        <div className="relative" ref={notifsRef}>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 hover:bg-white/5" style={{ color: "#94a3b8" }} onClick={openNotifs}>
            <Bell className="w-5 h-5" />
            {unreadNotifCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px] font-bold" style={{ background: "#3b82f6", color: "#fff", boxShadow: "none" }}>
                {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
              </Badge>
            )}
          </Button>

          {showNotifs && (
            <div className="absolute right-0 top-12 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#2d3748" }}>
                <h3 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>Notifications</h3>
                <button onClick={() => setShowNotifs(false)} style={{ color: "#64748b" }}><X className="w-4 h-4" /></button>
              </div>
              <div className="max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: "#374151" }} />
                    <p className="text-xs" style={{ color: "#64748b" }}>No notifications yet</p>
                  </div>
                ) : notifications.map(n => (
                  <button key={n.id} onClick={() => { selectRoom(n.roomId); setShowNotifs(false); }}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b" style={{ borderColor: "#2d3748", background: n.read ? "transparent" : "rgba(59,130,246,0.05)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.1)" }}>
                      <MessageSquare className="w-4 h-4" style={{ color: "#3b82f6" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: "#f1f5f9" }}>{n.senderName} in {n.roomName}</p>
                      <p className="text-xs truncate mt-0.5" style={{ color: "#64748b" }}>{n.content}</p>
                      <p className="text-[10px] mt-1" style={{ color: "#475569" }}>{formatNotifTime(n.timestamp)}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: "#3b82f6" }} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Help */}
        <div className="relative" ref={helpRef}>
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-white/5" style={{ color: "#94a3b8" }} onClick={openHelp}>
            <HelpCircle className="w-5 h-5" />
          </Button>
          {showHelp && (
            <div className="absolute right-0 top-12 w-72 rounded-2xl shadow-2xl z-50 overflow-hidden" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#2d3748" }}>
                <h3 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>Help & Support</h3>
                <button onClick={() => setShowHelp(false)} style={{ color: "#64748b" }}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-3 space-y-1">
                {[
                  { icon: MessageSquare, label: "Direct Messages", desc: "Search by Employee ID or name to DM a teammate" },
                  { icon: Phone, label: "Voice & Video Calls", desc: "Click the phone/video icon in any chat header" },
                  { icon: Bell, label: "Notifications", desc: "Bell icon shows all incoming messages in real time" },
                  { icon: BookOpen, label: "War Rooms", desc: "Group channels for project teams. Click + in sidebar" },
                  { icon: Mail, label: "External Chats", desc: "For vendors and contacts without an Employee ID" },
                  { icon: Info, label: "Employee ID", desc: "Format AEC-YY-XXXXX. Used to find teammates" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/5 cursor-default">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.1)" }}>
                      <item.icon className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "#f1f5f9" }}>{item.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t" style={{ borderColor: "#2d3748" }}>
                <p className="text-[11px] text-center" style={{ color: "#475569" }}>IntoAEC v1.0 · Siaratech Solutions</p>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative ml-1" ref={profileRef}>
          <button onClick={openProfile} className="relative w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs text-white hover:ring-2 hover:ring-[#3b82f6] transition-all" style={{ background: "#3b82f6" }}>
            {userInitials}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" style={{ background: "#22c55e", borderColor: "#0f1117" }} />
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-64 rounded-2xl shadow-2xl z-50 overflow-hidden" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
              {/* Profile header */}
              <div className="px-4 py-4 border-b" style={{ borderColor: "#2d3748" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white" style={{ background: "#3b82f6" }}>{userInitials}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "#f1f5f9" }}>{user?.displayName || user?.username}</p>
                    {user?.employeeId && <p className="text-xs font-mono" style={{ color: "#3b82f6" }}>{user.employeeId}</p>}
                    <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{user?.email}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
                  <span className="text-[11px]" style={{ color: "#22c55e" }}>Active</span>
                  <span className="text-[11px] ml-2 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>{user?.role}</span>
                </div>
              </div>

              {/* Menu items */}
              <div className="p-2">
                {[
                  { icon: User, label: "My Profile", sub: "View and edit your profile", action: () => router.push("/profile") },
                  { icon: Activity, label: "My Activity", sub: "Messages sent, files shared", action: () => {} },
                  { icon: Settings, label: "Settings", sub: "Notifications, privacy, theme", action: () => router.push("/settings") },
                ].map((item, i) => (
                  <button key={i} onClick={() => { item.action(); setShowProfile(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1f2937" }}>
                      <item.icon className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: "#f1f5f9" }}>{item.label}</p>
                      <p className="text-[11px]" style={{ color: "#64748b" }}>{item.sub}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#374151" }} />
                  </button>
                ))}
              </div>

              <div className="px-2 pb-2 border-t pt-2" style={{ borderColor: "#2d3748" }}>
                <button onClick={async () => { await logout(); router.replace("/login"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                    <LogOut className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
                  </div>
                  <p className="text-xs font-medium" style={{ color: "#ef4444" }}>Sign Out</p>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
