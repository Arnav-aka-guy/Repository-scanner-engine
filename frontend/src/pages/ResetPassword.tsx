import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { AuthShell, AuthError, AuthField } from '../components/auth/AuthShell';

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing reset token. Please request a new password reset link.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to reset password.');
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Set new password" subtitle="Enter your new password below to update your account credentials.">
      {submitted ? (
        <div className="rounded-[12px] border border-mint/30 bg-mint/[0.06] p-4">
          <div className="flex items-center gap-2 text-[14.5px] font-semibold text-mint">
            <CheckCircle2 size={17} />
            Password updated
          </div>
          <p className="mt-1.5 text-[14px] text-fg-2">Your password has been successfully updated.</p>
          <Link to="/login" className="btn-primary mt-4 h-10 w-full">
            Log in with new password
          </Link>
        </div>
      ) : (
        <>
          {error && <AuthError message={`Reset failed. ${error}`} />}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <AuthField
              id="reset-password"
              label="New password"
              icon={<Lock size={16} />}
              revealable
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={isSubmitting}
            />
            <AuthField
              id="reset-confirm"
              label="Confirm new password"
              icon={<Lock size={16} />}
              revealable
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
              disabled={isSubmitting}
            />
            <button type="submit" disabled={isSubmitting} className="btn-primary h-11 w-full text-[14.5px]">
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                'Update password'
              )}
            </button>
          </form>
          <p className="mt-6 text-[14px] text-fg-3">
            <Link to="/login" className="font-medium text-fg hover:text-ion">
              Back to login
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
};
