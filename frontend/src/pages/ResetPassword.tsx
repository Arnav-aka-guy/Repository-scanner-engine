import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { ErrorCard } from '../components/ErrorCard';

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#0F1115',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: '380px', marginBottom: '16px' }}>
        <Link
          to="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#A0A8B5',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} />
          <span>Back to login</span>
        </Link>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: '#151922',
          border: '1px solid #292F38',
          borderRadius: '8px',
          padding: '28px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#E6EAF0', margin: '0 0 4px' }}>
            Set new password
          </h1>
          <p style={{ fontSize: '12px', color: '#6F7887', margin: 0 }}>
            Enter your new password below to update your account credentials.
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: '16px' }}>
            <ErrorCard title="Reset failed" whatHappened={error} />
          </div>
        )}

        {submitted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: 'rgba(76, 175, 121, 0.1)',
                color: '#4CAF79',
              }}
            >
              <CheckCircle2 size={24} />
            </div>
            <p style={{ fontSize: '13px', color: '#A0A8B5', margin: 0, lineHeight: 1.5 }}>
              Your password has been successfully updated.
            </p>
            <Link
              to="/login"
              className="btn-primary"
              style={{
                width: '100%',
                height: '34px',
                fontSize: '13px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Log in with new password
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                htmlFor="new-password"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#A0A8B5',
                  marginBottom: '6px',
                }}
              >
                New password (min. 8 characters)
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#6F7887',
                  }}
                />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 34px 0 32px',
                    backgroundColor: '#0F1115',
                    color: '#E6EAF0',
                    border: '1px solid #292F38',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#6F7887',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#A0A8B5',
                  marginBottom: '6px',
                }}
              >
                Confirm new password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#6F7887',
                  }}
                />
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 12px 0 32px',
                    backgroundColor: '#0F1115',
                    color: '#E6EAF0',
                    border: '1px solid #292F38',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{
                width: '100%',
                height: '34px',
                fontSize: '13px',
                marginTop: '4px',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} style={{ animation: 'ds-spin 1s linear infinite' }} />
                  <span>Updating password...</span>
                </>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
