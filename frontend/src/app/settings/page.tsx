"use client";

import { useState, useEffect } from "react";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { useAuthStore } from "@/store/authStore";
import { authApi, userApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Settings as SettingsIcon, AlertTriangle, Key } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { isAuthenticated, isLoading, restoreSession, logout } = useAuthStore();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPwd, setIsChangingPwd] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [deactivatePassword, setDeactivatePassword] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateMessage, setDeactivateMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#0f1117" }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwdMessage({ text: "New passwords do not match.", type: "error" });
      return;
    }
    if (newPassword.length < 8) {
      setPwdMessage({ text: "Password must be at least 8 characters.", type: "error" });
      return;
    }

    setIsChangingPwd(true);
    setPwdMessage(null);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPwdMessage({ text: "Password successfully changed.", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwdMessage({ text: err.message || "Failed to change password.", type: "error" });
    } finally {
      setIsChangingPwd(false);
    }
  };

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("WARNING: This will permanently deactivate your account. Are you absolutely sure?")) return;
    
    setIsDeactivating(true);
    setDeactivateMessage(null);
    try {
      await userApi.deactivate(deactivatePassword);
      await logout();
      router.replace("/login");
    } catch (err: any) {
      setDeactivateMessage({ text: err.message || "Failed to deactivate account.", type: "error" });
      setIsDeactivating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#0f1117" }}>
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8" style={{ background: "#0f1117", color: "#f1f5f9" }}>
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <SettingsIcon className="w-6 h-6" style={{ color: "#3b82f6" }} />
                Settings
              </h1>
              <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
                Manage your account security and preferences.
              </p>
            </div>

            {/* Change Password Section */}
            <div className="p-6 rounded-2xl border space-y-6" style={{ background: "#161b22", borderColor: "#2d3748" }}>
              <div className="flex items-center gap-2 border-b pb-4" style={{ borderColor: "#2d3748" }}>
                <Shield className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-semibold">Change Password</h3>
              </div>

              {pwdMessage && (
                <div className={`p-4 rounded-xl text-sm ${pwdMessage.type === "success" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                  {pwdMessage.text}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#cbd5e1" }}>Current Password</label>
                  <Input 
                    type="password"
                    value={currentPassword} 
                    onChange={(e) => setCurrentPassword(e.target.value)} 
                    required
                    className="h-10 bg-transparent border-[#2d3748] focus-visible:ring-[#3b82f6]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#cbd5e1" }}>New Password</label>
                  <Input 
                    type="password"
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    required
                    className="h-10 bg-transparent border-[#2d3748] focus-visible:ring-[#3b82f6]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#cbd5e1" }}>Confirm New Password</label>
                  <Input 
                    type="password"
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    required
                    className="h-10 bg-transparent border-[#2d3748] focus-visible:ring-[#3b82f6]"
                  />
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={isChangingPwd} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    {isChangingPwd ? (
                      <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "white", borderTopColor: "transparent" }} />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    Update Password
                  </Button>
                </div>
              </form>
            </div>

            {/* Danger Zone Section */}
            <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-6">
              <div className="flex items-center gap-2 border-b border-red-500/20 pb-4">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-semibold text-red-500">Danger Zone</h3>
              </div>
              <p className="text-sm text-red-400/80">
                Deactivating your account will immediately log you out and prevent you from logging back in. This action is irreversible by you and requires an administrator to reactivate your account.
              </p>

              {deactivateMessage && (
                <div className="p-4 rounded-xl text-sm bg-red-500/20 text-red-400">
                  {deactivateMessage.text}
                </div>
              )}

              <form onSubmit={handleDeactivate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-red-400">Confirm Password to Deactivate</label>
                  <Input 
                    type="password"
                    value={deactivatePassword} 
                    onChange={(e) => setDeactivatePassword(e.target.value)} 
                    required
                    placeholder="Enter your password"
                    className="h-10 bg-black/20 border-red-500/30 text-white focus-visible:ring-red-500"
                  />
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={isDeactivating || !deactivatePassword} variant="destructive" className="gap-2 bg-red-600 hover:bg-red-700">
                    {isDeactivating ? (
                      <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "white", borderTopColor: "transparent" }} />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    Deactivate My Account
                  </Button>
                </div>
              </form>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
