// src/store/authStore.ts
// Zustand auth store — manages session, persists across page refreshes
// via the httpOnly refresh cookie (no localStorage).

import { create } from 'zustand';
import { authApi, setAccessToken, type User } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login:          (email: string, password: string) => Promise<void>;
  logout:         () => Promise<void>;
  register:       (data: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    inviteToken: string;
  }) => Promise<void>;
  restoreSession: () => Promise<void>;
  setUser:        (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:            null,
  isAuthenticated: false,
  isLoading:       true,

  login: async (email, password) => {
    const res = await authApi.login({ email, password });
    const { user, accessToken } = res.data!;
    setAccessToken(accessToken);
    connectSocket(accessToken);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore network error */ }
    setAccessToken(null);
    disconnectSocket();
    set({ user: null, isAuthenticated: false });
  },

  register: async (data) => {
    const res = await authApi.register(data);
    const { user, accessToken } = (res.data || {}) as { user: User; accessToken: string };
    if (user && accessToken) {
      setAccessToken(accessToken);
      connectSocket(accessToken);
      set({ user, isAuthenticated: true });
    }
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const refreshRes = await authApi.refresh();
      const accessToken = refreshRes.data?.accessToken;
      if (!accessToken) throw new Error('No token');

      setAccessToken(accessToken);

      const meRes = await authApi.getMe();
      const user  = meRes.data?.user;
      if (!user) throw new Error('No user');

      if (user.status === 'suspended') throw new Error('Suspended');

      connectSocket(accessToken);
      set({ user, isAuthenticated: true });
    } catch {
      setAccessToken(null);
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
