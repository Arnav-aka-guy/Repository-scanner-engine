import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Lock, User, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { login, isLoggingIn, loginError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await login(username.trim(), password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div
        className="w-full max-w-md p-8 rounded-2xl border shadow-2xl backdrop-blur-xl flex flex-col gap-6"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner mb-1"
            style={{
              backgroundColor: 'rgba(96, 165, 250, 0.1)',
              borderColor: 'rgba(96, 165, 250, 0.25)',
              color: 'var(--accent-primary)',
            }}
          >
            <ShieldCheck size={26} />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Authentication Required
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Please enter your administrator credentials to access the scanner engine.
          </p>
        </div>

        {loginError && (
          <div
            className="flex items-center gap-2.5 p-3 rounded-lg border text-xs"
            style={{
              backgroundColor: 'rgba(251, 113, 133, 0.08)',
              borderColor: 'rgba(251, 113, 133, 0.2)',
              color: 'var(--accent-rose)',
            }}
          >
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Username
            </label>
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border focus-within:border-[var(--accent-primary)] transition-colors"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
              }}
            >
              <User size={15} className="text-[var(--text-muted)]" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                autoFocus
                className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Password
            </label>
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border focus-within:border-[var(--accent-primary)] transition-colors"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Lock size={15} className="text-[var(--text-muted)]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="flex items-center justify-center gap-2 mt-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            style={{
              backgroundColor: 'var(--accent-primary)',
            }}
          >
            {isLoggingIn ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
