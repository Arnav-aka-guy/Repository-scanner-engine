import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, Loader2, Laptop } from 'lucide-react';
import { AuthShell, AuthError, AuthField } from '../components/auth/AuthShell';
import { useAuthStore } from '../stores/authStore';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { token, login, isLoggingIn, loginError, authEnabled } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      navigate('/app', { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim() || !password) {
      setLocalError('Please enter both your email and password.');
      return;
    }

    const res = await login(email.trim(), password);
    if (res.success) {
      navigate('/app', { replace: true });
    } else if (res.error) {
      setLocalError(res.error);
    }
  };

  return (
    <AuthShell
      title="Log in to your workspace"
      subtitle="Pick up where you left off with your saved repositories."
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className="font-medium text-fg hover:text-ion">
            Sign up
          </Link>
        </>
      }
    >
      {!authEnabled && (
        <div className="mb-6 rounded-[12px] border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <Laptop size={16} className="text-ion" />
            Local mode is on
          </div>
          <p className="mt-1 text-[13.5px] text-fg-3">You can scan code on this computer without an account.</p>
          <button type="button" onClick={() => navigate('/app')} className="btn-secondary mt-3 h-9 w-full">
            Continue without logging in
          </button>
        </div>
      )}

      {(localError || loginError) && <AuthError message={(localError || loginError) as string} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <AuthField
          id="login-email"
          label="Email or Username"
          icon={<Mail size={16} />}
          type="text"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={isLoggingIn}
        />
        <AuthField
          id="login-password"
          label="Password"
          icon={<Lock size={16} />}
          revealable
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          disabled={isLoggingIn}
          aside={
            <Link to="/forgot-password" className="text-[13px] text-fg-3 hover:text-fg">
              Forgot password?
            </Link>
          }
        />
        <button type="submit" disabled={isLoggingIn} className="btn-primary mt-1 h-11 w-full text-[14.5px]">
          {isLoggingIn ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>
    </AuthShell>
  );
};
