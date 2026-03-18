"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { ApiError } from "@/lib/api";
import { CheckCircle, AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading, restoreSession } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => { restoreSession(); }, [restoreSession]);
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/");
  }, [isLoading, isAuthenticated, router]);

  if (!inviteToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f1117" }}>
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl text-white mx-auto mb-4" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>IA</div>
          <div className="rounded-2xl p-6" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
            <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: "#ef4444" }} />
            <h2 className="font-semibold mb-2" style={{ color: "#f1f5f9" }}>Invalid Invitation</h2>
            <p className="text-sm" style={{ color: "#64748b" }}>
              This registration link is missing an invite token. Please ask your administrator to resend the invitation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f1117" }}>
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl text-white mx-auto mb-4" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>IA</div>
          <div className="rounded-2xl p-6" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
            <CheckCircle className="w-8 h-8 mx-auto mb-3" style={{ color: "#22c55e" }} />
            <h2 className="font-semibold mb-2" style={{ color: "#f1f5f9" }}>Account Created!</h2>
            <p className="text-sm mb-4" style={{ color: "#64748b" }}>
              Welcome to IntoAEC. Redirecting you to the workspace...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password)) {
      setError("Password must contain uppercase, lowercase, and a number.");
      return;
    }

    setLoading(true);
    try {
      await register({
        username: form.username,
        email: form.email,
        password: form.password,
        displayName: form.displayName || form.username,
        inviteToken,
      });
      setSuccess(true);
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = "text", placeholder = "") => (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        required={key !== "displayName"}
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
        style={{ background: "#1f2937", color: "#f1f5f9", border: "1px solid #374151" }}
        onFocus={e => (e.target.style.borderColor = "#3b82f6")}
        onBlur={e => (e.target.style.borderColor = "#374151")}
      />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f1117" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl text-white mb-4" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>IA</div>
          <h1 className="text-xl font-bold" style={{ color: "#f1f5f9" }}>IntoAEC</h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>Siaratech Solutions</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: "#161b22", border: "1px solid #2d3748" }}>
          <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#22c55e" }} />
            <p className="text-xs" style={{ color: "#4ade80" }}>Valid invitation — complete your registration below</p>
          </div>

          <h2 className="text-base font-semibold mb-1" style={{ color: "#f1f5f9" }}>Create your account</h2>
          <p className="text-xs mb-5" style={{ color: "#64748b" }}>You'll receive a unique Employee ID on registration.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            {field("displayName", "Full Name", "text", "Priya Sharma")}
            {field("username", "Username", "text", "priya_sharma")}
            {field("email", "Work Email", "email", "priya@company.com")}
            {field("password", "Password", "password", "Min 8 chars, upper + lower + number")}
            {field("confirmPassword", "Confirm Password", "password", "Repeat your password")}

            {error && (
              <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all mt-1"
              style={{ background: loading ? "#1f2937" : "#3b82f6", color: loading ? "#64748b" : "#fff", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 4px 12px rgba(59,130,246,0.35)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#64748b", borderTopColor: "transparent" }} />
                  Creating account…
                </span>
              ) : "Create Account"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "#374151" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "#3b82f6" }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
