import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, User, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { token, register, isLoggingIn, loginError } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      {/* Back to Home Link */}
      <div style={{ width: '100%', maxWidth: '400px', marginBottom: '16px' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#A0A8B5',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#E6EAF0')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#A0A8B5')}
        >
          <ArrowLeft size={14} />
          <span>Back to overview</span>
        </Link>
      </div>

      {/* Signup Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: '#151922',
          border: '1px solid #292F38',
          borderRadius: '8px',
          padding: '28px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                backgroundColor: '#5B8DEF',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              A
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#E6EAF0' }}>
              Repository Scanner
            </span>
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#E6EAF0', margin: '0 0 4px' }}>
            Create your account
          </h1>
          <p style={{ fontSize: '12px', color: '#6F7887', margin: 0 }}>
            Manage up to 5 repositories with code intelligence
          </p>
        </div>

        {/* Error Alert */}
        {(localError || loginError) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              backgroundColor: 'rgba(201, 90, 90, 0.1)',
              border: '1px solid rgba(201, 90, 90, 0.25)',
              borderRadius: '6px',
              padding: '10px 12px',
              marginBottom: '18px',
              fontSize: '12px',
              color: '#C95A5A',
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{localError || loginError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label
              htmlFor="signup-name"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: '#A0A8B5',
                marginBottom: '6px',
              }}
            >
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <User
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
                id="signup-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                disabled={isLoggingIn}
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
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#292F38')}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="signup-email"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: '#A0A8B5',
                marginBottom: '6px',
              }}
            >
              Email Address
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
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@example.com"
                disabled={isLoggingIn}
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
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#292F38')}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="signup-password"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: '#A0A8B5',
                marginBottom: '6px',
              }}
            >
              Password (min. 8 characters)
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
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoggingIn}
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
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#292F38')}
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

            {/* Password strength hints */}
            {password.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '6px',
                  fontSize: '11px',
                  color: '#6F7887',
                }}
              >
                <span style={{ color: isPasswordLong ? '#4CAF79' : '#6F7887' }}>
                  {isPasswordLong ? '✓ 8+ chars' : '○ 8+ chars'}
                </span>
                <span style={{ color: hasMixedChars ? '#4CAF79' : '#6F7887' }}>
                  {hasMixedChars ? '✓ letters & numbers' : '○ letters & numbers'}
                </span>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="signup-confirm-password"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: '#A0A8B5',
                marginBottom: '6px',
              }}
            >
              Confirm Password
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
                id="signup-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoggingIn}
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
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5B8DEF')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#292F38')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="btn-primary"
            style={{
              width: '100%',
              height: '34px',
              fontSize: '13px',
              marginTop: '4px',
            }}
          >
            {isLoggingIn ? (
              <>
                <Loader2 size={14} style={{ animation: 'ds-spin 1s linear infinite' }} />
                <span>Creating account...</span>
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Footer Links */}
        <div
          style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid #1E2530',
            textAlign: 'center',
            fontSize: '12px',
            color: '#6F7887',
          }}
        >
          <span>Already have an account? </span>
          <Link
            to="/login"
            style={{
              color: '#5B8DEF',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
};
