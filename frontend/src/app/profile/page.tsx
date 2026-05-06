"use client";

import { useState, useRef, useEffect } from "react";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { useAuthStore } from "@/store/authStore";
import { userApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Save, Trash2, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { user, setUser, isAuthenticated, isLoading, restoreSession } = useAuthStore();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setBio(user.bio || "");
    }
  }, [user]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#0f1117" }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await userApi.updateProfile({ displayName, bio });
      if (res.data?.user) {
        setUser(res.data.user);
        setMessage({ text: "Profile updated successfully.", type: "success" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to update profile.", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);
    try {
      const res = await userApi.uploadAvatar(file);
      if (res.data?.user) {
        setUser(res.data.user);
        setMessage({ text: "Avatar updated successfully.", type: "success" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to upload avatar.", type: "error" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAvatarDelete = async () => {
    if (!confirm("Are you sure you want to remove your avatar?")) return;
    setIsUploading(true);
    setMessage(null);
    try {
      await userApi.deleteAvatar();
      if (user) {
        setUser({ ...user, avatar: null });
        setMessage({ text: "Avatar removed.", type: "success" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to remove avatar.", type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  const userInitials = user ? (user.displayName || user.username).slice(0, 2).toUpperCase() : "??";
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  const avatarUrl = user?.avatar ? `${backendUrl}${user.avatar}` : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#0f1117" }}>
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8" style={{ background: "#0f1117", color: "#f1f5f9" }}>
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <h1 className="text-2xl font-bold">My Profile</h1>
              <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
                Update your personal information and avatar.
              </p>
            </div>

            {message && (
              <div className={`p-4 rounded-xl text-sm ${message.type === "success" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                {message.text}
              </div>
            )}

            <div className="p-6 rounded-2xl border" style={{ background: "#161b22", borderColor: "#2d3748" }}>
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center text-3xl font-bold" style={{ background: avatarUrl ? "transparent" : "#3b82f6" }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white">{userInitials}</span>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors" title="Change Avatar">
                      <Camera className="w-5 h-5 text-white" />
                    </button>
                    {avatarUrl && (
                      <button onClick={handleAvatarDelete} className="p-2 bg-red-500/80 rounded-full hover:bg-red-500 ml-2 transition-colors" title="Remove Avatar">
                        <Trash2 className="w-5 h-5 text-white" />
                      </button>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{user?.displayName || user?.username}</h3>
                  <p className="text-sm text-blue-500 font-mono mt-1">{user?.employeeId || "No Employee ID"}</p>
                  <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>{user?.email}</p>
                  <p className="text-xs px-2 py-0.5 rounded-full inline-block mt-2" style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>Role: {user?.role}</p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl border space-y-6" style={{ background: "#161b22", borderColor: "#2d3748" }}>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <UserIcon className="w-5 h-5" style={{ color: "#3b82f6" }} />
                Profile Details
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#cbd5e1" }}>Display Name</label>
                  <Input 
                    value={displayName} 
                    onChange={(e) => setDisplayName(e.target.value)} 
                    placeholder="Enter your display name"
                    className="h-10 bg-transparent border-[#2d3748] focus-visible:ring-[#3b82f6]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#cbd5e1" }}>Bio</label>
                  <textarea 
                    value={bio} 
                    onChange={(e) => setBio(e.target.value)} 
                    placeholder="Write a short bio about yourself..."
                    className="w-full h-24 p-3 rounded-lg text-sm bg-transparent border focus:outline-none focus:ring-1 transition-shadow resize-none"
                    style={{ borderColor: "#2d3748", color: "#f1f5f9" }}
                  />
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>Max 200 characters.</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSaving || (displayName === user?.displayName && bio === user?.bio)}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "white", borderTopColor: "transparent" }} />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
