import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2, Info } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { AuthShell, AuthError, AuthField } from '../components/auth/AuthShell';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailEnabled = useAuthStore((st) => st.capabilities.passwordResetEmail);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to submit password reset request.');
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email to receive password reset instructions."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-fg hover:text-ion">
            Return to login
          </Link>
        </>
      }
    >
      {!emailEnabled ? (
        <div className="rounded-[12px] border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold">
            <Info size={17} className="text-ion" />
            Email is not set up on this server
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-fg-2">
            We can't send you a reset link. Ask the person who runs this server to reset your password for you.
          </p>
        </div>
      ) : submitted ? (
        <div className="rounded-[12px] border border-mint/30 bg-mint/[0.06] p-4">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold text-mint">
            <CheckCircle2 size={17} />
            Check your inbox
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-fg-2">
            If an account matches <strong>{email}</strong>, we have sent a link to reset your password. It works for 30 minutes.
          </p>
        </div>
      ) : (
        <>
          {error && <AuthError message={`Password reset failed. ${error}`} />}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <AuthField
              id="forgot-email"
              label="Email address"
              icon={<Mail size={16} />}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isSubmitting}
            />
            <button type="submit" disabled={isSubmitting} className="btn-primary h-11 w-full text-[14.5px]">
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sending…
                </>
              ) : (
                'Send reset instructions'
              )}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
};
