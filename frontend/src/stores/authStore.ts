import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  authEnabled: boolean;
  loginError: string | null;
  isLoggingIn: boolean;
  setToken: (token: string | null) => void;
  checkAuthStatus: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      authEnabled: false,
      loginError: null,
      isLoggingIn: false,

      setToken: (token) => set({ token }),

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
        return false;
      },

      login: async (username, password) => {
        if (!get().authEnabled) {
          set({ loginError: 'Authentication is disabled on this server.' });
          return false;
        }

        set({ isLoggingIn: true, loginError: null });
        try {
          const res = await fetch('/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const msg = data.detail || 'Login failed. Invalid credentials.';
            set({ isLoggingIn: false, loginError: msg });
            return false;
          }

          const data = await res.json();
          set({ token: data.access_token, isLoggingIn: false, loginError: null });
          return true;
        } catch (err: any) {
          set({ isLoggingIn: false, loginError: err.message || 'Unable to connect to server.' });
          return false;
        }
      },

      logout: () => {
        set({ token: null });
      },
    }),
    {
      name: 'antigravity-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
