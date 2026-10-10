import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { ErrorCard } from '../components/ErrorCard';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            Reset your password
          </h1>
          <p style={{ fontSize: '12px', color: '#6F7887', margin: 0 }}>
            Enter your email to receive password reset instructions.
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: '16px' }}>
            <ErrorCard title="Password reset failed" technicalError={error} />
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
              If an account matches <strong>{email}</strong>, instructions to reset your password have been generated.
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
              Return to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                htmlFor="reset-email"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#A0A8B5',
                  marginBottom: '6px',
                }}
              >
                Email address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
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
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
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
                  <span>Submitting...</span>
                </>
              ) : (
                'Send reset instructions'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
