import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  created_at?: string;
  repository_count: number;
  max_repositories: number;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  authEnabled: boolean;
  loginError: string | null;
  isLoggingIn: boolean;
  setToken: (token: string | null) => void;
  setUser: (user: UserProfile | null) => void;
  checkAuthStatus: () => Promise<boolean>;
  fetchProfile: () => Promise<UserProfile | null>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      authEnabled: true,
      loginError: null,
      isLoggingIn: false,

      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),

      checkAuthStatus: async () => {
        try {
          const res = await fetch('/api/auth/status');
          if (res.ok) {
            const data = await res.json();
            const enabled = Boolean(data.auth_enabled);
            set({ authEnabled: enabled });
            return enabled;
          }
        } catch {
          // ignore network failure on status check
        }
        return true;
      },

      fetchProfile: async () => {
        const token = get().token;
        if (!token) return null;
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const user: UserProfile = await res.json();
            set({ user });
            return user;
          }
          if (res.status === 401) {
            set({ token: null, user: null });
          }
        } catch {
          // network error
        }
        return null;
      },

      login: async (email, password) => {
        set({ isLoggingIn: true, loginError: null });
        try {
          // Attempt standard user login
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), password }),
          });

          if (res.ok) {
            const data = await res.json();
            set({
              token: data.access_token,
              user: data.user || null,
              isLoggingIn: false,
              loginError: null,
            });
            return { success: true };
          }

          // Try legacy admin token endpoint if email is admin username
          const adminRes = await fetch('/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: email.trim(), password }),
          });

          if (adminRes.ok) {
            const data = await adminRes.json();
            const adminUser: UserProfile = data.user || {
              id: 1,
              name: 'Administrator',
              email: `${email.trim()}@localhost`,
              repository_count: 0,
              max_repositories: 5,
            };
            set({
              token: data.access_token,
              user: adminUser,
              isLoggingIn: false,
              loginError: null,
            });
            return { success: true };
          }

          const errData = await res.json().catch(() => ({}));
          const errorMsg = errData.detail || 'Incorrect email or password.';
          set({ isLoggingIn: false, loginError: errorMsg });
          return { success: false, error: errorMsg };
        } catch (err: any) {
          const msg = err.message || 'Unable to connect to analysis server.';
          set({ isLoggingIn: false, loginError: msg });
          return { success: false, error: msg };
        }
      },

      register: async (name, email, password) => {
        set({ isLoggingIn: true, loginError: null });
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errorMsg = errData.detail || 'Registration failed.';
            set({ isLoggingIn: false, loginError: errorMsg });
            return { success: false, error: errorMsg };
          }

          const data = await res.json();
          set({
            token: data.access_token,
            user: data.user || null,
            isLoggingIn: false,
            loginError: null,
          });
          return { success: true };
        } catch (err: any) {
          const msg = err.message || 'Network error during registration.';
          set({ isLoggingIn: false, loginError: msg });
          return { success: false, error: msg };
        }
      },

      logout: () => {
        set({ token: null, user: null, loginError: null });
      },
    }),
    {
      name: 'antigravity-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
