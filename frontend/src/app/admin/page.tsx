"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { adminApi, type User, type Invitation, ApiError } from "@/lib/api";
import {
  Users, Mail, Plus, Check, X, Clock, Ban,
  RefreshCw, Copy, ChevronLeft, Shield, UserCheck
} from "lucide-react";

export default function AdminPage() {
  const { user, isAuthenticated, isLoading, restoreSession } = useAuthStore();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"invite" | "employees" | "pending">("invite");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteNote, setInviteNote] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteError, setInviteError] = useState("");

  const [employees, setEmployees] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => { restoreSession(); }, [restoreSession]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
    if (!isLoading && isAuthenticated && user?.role !== "admin") router.replace("/");
  }, [isLoading, isAuthenticated, user, router]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [empRes, pendRes, invRes] = await Promise.all([
        adminApi.listUsers("approved"),
        adminApi.getPending(),
        adminApi.listInvitations("pending"),
      ]);
      setEmployees(empRes.data?.users ?? []);
      setPendingUsers(pendRes.data?.users ?? []);
      setInvitations(invRes.data?.invitations ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") loadData();
  }, [isAuthenticated, user, loadData]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    setInviting(true);
    try {
      await adminApi.createInvitation({ email: inviteEmail, role: inviteRole, note: inviteNote });
      setInviteSuccess(`Invitation sent to ${inviteEmail}. They'll receive a registration link via email.`);
      setInviteEmail("");
      setInviteNote("");
      loadData();
    } catch (err) {
      if (err instanceof ApiError) setInviteError(err.message);
      else setInviteError("Failed to send invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await adminApi.approveUser(userId);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSuspend = async (userId: string) => {
    if (!confirm("Suspend this user? They will be logged out immediately.")) return;
    try {
      await adminApi.suspendUser(userId);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevoke = async (invId: string) => {
    try {
      await adminApi.revokeInvitation(invId);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const copyRegLink = (token?: string) => {
    if (!token) return;
    const link = `${window.location.origin}/register?invite=${token}`;
    navigator.clipboard.writeText(link);
  };

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center" style={{ background: "#0f1117" }}>
      <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }} />
    </div>
  );

  const tabs = [
    { id: "invite", label: "Invite", icon: Mail, badge: null },
    { id: "employees", label: "Employees", icon: Users, badge: employees.length },
    { id: "pending", label: "Pending", icon: Clock, badge: pendingUsers.length },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: "#0f1117" }}>
      {/* Top bar */}
      <div className="border-b px-4 h-14 flex items-center gap-3" style={{ background: "#161b22", borderColor: "#2d3748" }}>
        <button onClick={() => router.push("/")} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#94a3b8" }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs text-white" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>IA</div>
        <div>
          <h1 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>Admin Panel</h1>
          <p className="text-[10px]" style={{ color: "#64748b" }}>IntoAEC — Siaratech Solutions</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={loadData} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#64748b" }}>
            <RefreshCw className={`w-4 h-4 ${loadingData ? "animate-spin" : ""}`} />
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <Shield className="w-3 h-3" style={{ color: "#3b82f6" }} />
            <span className="text-xs font-medium" style={{ color: "#3b82f6" }}>Admin</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeTab === tab.id ? "#1f2937" : "transparent",
                color: activeTab === tab.id ? "#f1f5f9" : "#64748b",
              }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.badge !== null && tab.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: activeTab === tab.id ? "#3b82f6" : "#374151", color: "#fff" }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── INVITE TAB ── */}
        {activeTab === "invite" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
              <h2 className="font-semibold text-sm mb-1" style={{ color: "#f1f5f9" }}>Send Invitation</h2>
              <p className="text-xs mb-4" style={{ color: "#64748b" }}>
                The employee will receive an email with a registration link. They'll get a unique Employee ID on sign-up.
              </p>

              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Work Email *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="employee@company.com"
                    required
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{ background: "#1f2937", color: "#f1f5f9", border: "1px solid #374151" }}
                    onFocus={e => (e.target.style.borderColor = "#3b82f6")}
                    onBlur={e => (e.target.style.borderColor = "#374151")}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{ background: "#1f2937", color: "#f1f5f9", border: "1px solid #374151" }}
                  >
                    <option value="user">Employee</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Note <span style={{ color: "#475569" }}>(optional)</span></label>
                  <input
                    type="text"
                    value={inviteNote}
                    onChange={e => setInviteNote(e.target.value)}
                    placeholder="e.g. Site Engineer - Block A"
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                    style={{ background: "#1f2937", color: "#f1f5f9", border: "1px solid #374151" }}
                    onFocus={e => (e.target.style.borderColor = "#3b82f6")}
                    onBlur={e => (e.target.style.borderColor = "#374151")}
                  />
                </div>

                {inviteSuccess && (
                  <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
                    <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {inviteSuccess}
                  </div>
                )}
                {inviteError && (
                  <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                    {inviteError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={inviting}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{ background: inviting ? "#1f2937" : "#3b82f6", color: inviting ? "#64748b" : "#fff", boxShadow: inviting ? "none" : "0 4px 12px rgba(59,130,246,0.35)" }}
                >
                  {inviting ? (
                    <><span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#64748b", borderTopColor: "transparent" }} />Sending…</>
                  ) : (
                    <><Mail className="w-4 h-4" />Send Invitation</>
                  )}
                </button>
              </form>
            </div>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
                <h3 className="font-semibold text-sm mb-3" style={{ color: "#f1f5f9" }}>Pending Invitations</h3>
                <div className="space-y-2">
                  {invitations.map(inv => (
                    <div key={inv._id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#0f1117", border: "1px solid #2d3748" }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.1)" }}>
                        <Mail className="w-4 h-4" style={{ color: "#3b82f6" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: "#f1f5f9" }}>{inv.email}</p>
                        <p className="text-[11px]" style={{ color: "#64748b" }}>
                          {inv.role} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button onClick={() => handleRevoke(inv._id)} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#64748b" }} title="Revoke">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EMPLOYEES TAB ── */}
        {activeTab === "employees" && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#2d3748" }}>
              <h2 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>Active Employees</h2>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{employees.length} approved members</p>
            </div>
            {employees.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 mx-auto mb-2" style={{ color: "#374151" }} />
                <p className="text-sm" style={{ color: "#64748b" }}>No employees yet. Send invitations to get started.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#2d3748" }}>
                {employees.map(emp => {
                  const initials = (emp.displayName || emp.username).slice(0, 2).toUpperCase();
                  const colors = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899"];
                  const color = colors[emp._id.charCodeAt(0) % colors.length];
                  return (
                    <div key={emp._id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-sm text-white flex-shrink-0" style={{ background: color }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate" style={{ color: "#f1f5f9" }}>{emp.displayName || emp.username}</p>
                          {emp.role === "admin" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>Admin</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs font-mono" style={{ color: "#3b82f6" }}>{emp.employeeId || "—"}</p>
                          <span style={{ color: "#374151" }}>·</span>
                          <p className="text-xs truncate" style={{ color: "#64748b" }}>{emp.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: emp.isOnline ? "#22c55e" : "#6b7280" }} />
                        {emp.role !== "admin" && (
                          <button onClick={() => handleSuspend(emp._id)} className="p-1.5 rounded-lg hover:bg-white/5 ml-1" style={{ color: "#64748b" }} title="Suspend">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PENDING TAB ── */}
        {activeTab === "pending" && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#2d3748" }}>
              <h2 className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>Pending Approval</h2>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{pendingUsers.length} users waiting</p>
            </div>
            {pendingUsers.length === 0 ? (
              <div className="p-8 text-center">
                <UserCheck className="w-8 h-8 mx-auto mb-2" style={{ color: "#374151" }} />
                <p className="text-sm" style={{ color: "#64748b" }}>No pending approvals.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#2d3748" }}>
                {pendingUsers.map(u => (
                  <div key={u._id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-sm text-white flex-shrink-0" style={{ background: "#374151" }}>
                      {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#f1f5f9" }}>{u.displayName || u.username}</p>
                      <p className="text-xs truncate" style={{ color: "#64748b" }}>{u.email}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "#475569" }}>
                        Registered {new Date(u.createdAt!).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleApprove(u._id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                        <Check className="w-3 h-3" />Approve
                      </button>
                      <button onClick={() => handleSuspend(u._id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <X className="w-3 h-3" />Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
