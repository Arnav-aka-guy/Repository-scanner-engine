import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, User, Loader2, Check } from 'lucide-react';
import { AuthShell, AuthError, AuthField } from '../components/auth/AuthShell';
import { useAuthStore } from '../stores/authStore';

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { token, register, isLoggingIn, loginError } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      navigate('/app', { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Please enter your name.');
      return;
    }

    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const res = await register(name.trim(), email.trim(), password);
    if (res.success) {
      navigate('/app', { replace: true });
    } else if (res.error) {
      setLocalError(res.error);
    }
  };

  const isPasswordLong = password.length >= 8;
  const hasMixedChars = /[a-zA-Z]/.test(password) && /[0-9]/.test(password);

  return (
    <AuthShell
      title="Create your account"
      subtitle="Manage up to 5 repositories with code intelligence, search and health reports."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-fg hover:text-ion">
            Log in
          </Link>
        </>
      }
    >
      {(localError || loginError) && <AuthError message={(localError || loginError) as string} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <AuthField
          id="signup-name"
          label="Full Name"
          icon={<User size={16} />}
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          disabled={isLoggingIn}
        />
        <AuthField
          id="signup-email"
          label="Email Address"
          icon={<Mail size={16} />}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={isLoggingIn}
        />
        <div>
          <AuthField
            id="signup-password"
            label="Password"
            icon={<Lock size={16} />}
            revealable
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            disabled={isLoggingIn}
          />
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            <Rule ok={isPasswordLong}>8 or more characters</Rule>
            <Rule ok={hasMixedChars}>Letters and numbers</Rule>
          </div>
        </div>
        <AuthField
          id="signup-confirm"
          label="Confirm Password"
          icon={<Lock size={16} />}
          revealable
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Type it again"
          disabled={isLoggingIn}
        />
        <button type="submit" disabled={isLoggingIn} className="btn-primary mt-1 h-11 w-full text-[14.5px]">
          {isLoggingIn ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Creating account…
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </form>
    </AuthShell>
  );
};

const Rule: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <span className={`inline-flex items-center gap-1.5 ${ok ? 'text-mint' : 'text-fg-4'}`}>
    <Check size={13} className={ok ? '' : 'opacity-40'} />
    {children}
  </span>
);
