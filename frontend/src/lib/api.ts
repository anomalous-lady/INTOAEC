// src/lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

let _accessToken: string | null = null;
export const setAccessToken = (token: string | null) => { _accessToken = token; };
export const getAccessToken = () => _accessToken;

export interface ApiResponse<T = unknown> {
  status: 'success' | 'fail' | 'error';
  message?: string;
  data?: T;
  results?: number;
}

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface User {
  _id: string;
  employeeId?: string;
  username: string;
  email?: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  role?: 'user' | 'moderator' | 'admin';
  status?: 'pending' | 'approved' | 'suspended';
  isEmailVerified?: boolean;
  isOnline: boolean;
  lastSeen: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Participant {
  user: User;
  role: 'member' | 'admin';
  joinedAt: string;
  lastRead: string | null;
  isMuted: boolean;
}

export interface Conversation {
  _id: string;
  type: 'direct' | 'group' | 'ai';
  name?: string;
  description?: string;
  avatar?: string | null;
  participants: Participant[];
  lastMessage?: Message | null;
  lastActivity: string;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
  vendorPhone?: string;
  vendorCompany?: string;
  vendorContact?: string;
}

export interface Attachment {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  sender: User;
  content?: string;
  messageType: 'text' | 'image' | 'file' | 'audio' | 'video' | 'system' | 'ai';
  attachments: Attachment[];
  replyTo?: Message | null;
  readBy: { user: string; readAt: string }[];
  reactions: { emoji: string; user: string }[];
  isEdited: boolean;
  editedAt?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Call {
  _id: string;
  roomId: string;
  conversationId: string;
  initiator: User;
  participants: {
    user: User;
    status: 'invited' | 'joined' | 'left' | 'rejected' | 'missed';
    joinedAt: string;
    leftAt?: string;
  }[];
  type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'rejected';
  startedAt?: string;
  endedAt?: string;
  duration: number;
  createdAt: string;
}

export interface Invitation {
  _id: string;
  email: string;
  invitedBy: Pick<User, '_id' | 'username' | 'displayName'>;
  role: 'user' | 'moderator' | 'admin';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  acceptedAt?: string;
  note?: string;
  createdAt: string;
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<ApiResponse<T>> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    ...(fetchOptions.body && !(fetchOptions.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth && _accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !skipAuth && !path.includes('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({}));
        throw new ApiError(retryRes.status, err.message || 'Request failed');
      }
      return retryRes.json();
    }
    _accessToken = null;
    throw new ApiError(401, 'Session expired. Please log in again.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.message || 'Request failed');
  }

  if (res.status === 204) return { status: 'success' };
  return res.json();
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    _accessToken = data.data?.accessToken || null;
    return !!_accessToken;
  } catch {
    return false;
  }
}

const api = {
  get:    <T>(path: string, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post:   <T>(path: string, body?: unknown, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: <T>(path: string, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

export const authApi = {
  register: (data: {
    username: string; email: string; password: string;
    displayName?: string; inviteToken: string;
  }) => api.post<{ user: User; accessToken: string }>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ user: User; accessToken: string }>('/auth/login', data),
  logout:   () => api.post('/auth/logout'),
  logoutAll:() => api.post('/auth/logout-all'),
  refresh:  () => api.post<{ accessToken: string }>('/auth/refresh'),
  getMe:    () => api.get<{ user: User }>('/auth/me'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.patch(`/auth/reset-password/${token}`, { password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch('/auth/change-password', { currentPassword, newPassword }),
  verifyEmail: (token: string) => api.get(`/auth/verify-email/${token}`),
};

export const userApi = {
  search:        (q: string, page = 1) =>
    api.get<{ users: User[] }>(`/users/search?q=${encodeURIComponent(q)}&page=${page}`),
  getOnline:     () => api.get<{ users: User[] }>('/users/online'),
  getProfile:    (userId: string) => api.get<{ user: User }>(`/users/${userId}`),
  updateProfile: (data: { displayName?: string; bio?: string }) =>
    api.patch<{ user: User }>('/users/me/profile', data),
  uploadAvatar:  (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post<{ user: User }>('/users/me/avatar', form);
  },
  deleteAvatar:  () => api.delete('/users/me/avatar'),
  deactivate:    (password: string) =>
    api.delete('/users/me/deactivate',
      { body: JSON.stringify({ password }), headers: { 'Content-Type': 'application/json' } }),
};

export const conversationApi = {
  getAll:   (page = 1) =>
    api.get<{ conversations: Conversation[] }>(`/conversations?page=${page}`),
  getExternal: (page = 1) =>
    api.get<{ conversations: Conversation[] }>(`/conversations/external?page=${page}`),
  getDirect:(userId: string) =>
    api.get<{ conversation: Conversation }>(`/conversations/direct/${userId}`),
  createGroup: (data: { name: string; participantIds: string[]; description?: string }) =>
    api.post<{ conversation: Conversation }>('/conversations/group', data),
  get:      (id: string) =>
    api.get<{ conversation: Conversation }>(`/conversations/${id}`),
  update:   (id: string, data: { name?: string; description?: string }) =>
    api.patch<{ conversation: Conversation }>(`/conversations/${id}`, data),
  addParticipants: (id: string, userIds: string[]) =>
    api.post(`/conversations/${id}/participants`, { userIds }),
  leave:    (id: string) => api.post(`/conversations/${id}/leave`),
  markRead: (id: string) => api.post(`/conversations/${id}/read`),
};

export const messageApi = {
  getMessages: (conversationId: string, before?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return api.get<{ messages: Message[] }>(
      `/conversations/${conversationId}/messages?${params}`
    );
  },
  search: (conversationId: string, q: string) =>
    api.get<{ messages: Message[] }>(
      `/conversations/${conversationId}/messages/search?q=${encodeURIComponent(q)}`
    ),
  send: (conversationId: string, data: { content?: string; messageType?: string; replyTo?: string; files?: File[] }) => {
    const { files, ...rest } = data;
    if (files?.length) {
      const form = new FormData();
      if (rest.content) form.append('content', rest.content);
      if (rest.replyTo)  form.append('replyTo', rest.replyTo);
      files.forEach((f) => form.append('files', f));
      return api.post<{ message: Message }>(`/conversations/${conversationId}/messages`, form);
    }
    return api.post<{ message: Message }>(`/conversations/${conversationId}/messages`, rest);
  },
  edit:   (conversationId: string, messageId: string, content: string) =>
    api.patch<{ message: Message }>(`/conversations/${conversationId}/messages/${messageId}`, { content }),
  delete: (conversationId: string, messageId: string) =>
    api.delete(`/conversations/${conversationId}/messages/${messageId}`),
  react:  (conversationId: string, messageId: string, emoji: string) =>
    api.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, { emoji }),
  markRead: (conversationId: string) =>
    api.post(`/conversations/${conversationId}/messages/read`),
};

export const callApi = {
  initiate:   (conversationId: string, type: 'audio' | 'video' = 'video') =>
    api.post<{ call: Call }>('/calls', { conversationId, type }),
  join:       (roomId: string) => api.post<{ call: Call }>(`/calls/${roomId}/join`),
  end:        (roomId: string, reason?: string) => api.post(`/calls/${roomId}/end`, { reason }),
  reject:     (roomId: string) => api.post(`/calls/${roomId}/reject`),
  getHistory: (conversationId: string, page = 1) =>
    api.get<{ calls: Call[] }>(`/calls/history/${conversationId}?page=${page}`),
  getActive:  (conversationId: string) =>
    api.get<{ call: Call | null }>(`/calls/active/${conversationId}`),
};

export const adminApi = {
  createInvitation: (data: { email: string; role?: string; note?: string }) =>
    api.post<{ invitation: Invitation }>('/admin/invitations', data),
  listInvitations:  (status = 'all', page = 1) =>
    api.get<{ invitations: Invitation[] }>(`/admin/invitations?status=${status}&page=${page}`),
  revokeInvitation: (id: string) => api.delete(`/admin/invitations/${id}`),
  listUsers:    (status = 'all', page = 1) =>
    api.get<{ users: User[] }>(`/admin/users?status=${status}&page=${page}`),
  getPending:   () => api.get<{ users: User[] }>('/admin/users/pending'),
  approveUser:  (userId: string) => api.patch<{ user: User }>(`/admin/users/${userId}/approve`),
  suspendUser:  (userId: string) => api.patch(`/admin/users/${userId}/suspend`),
  changeRole:   (userId: string, role: string) => api.patch(`/admin/users/${userId}/role`, { role }),
};

export default api;
