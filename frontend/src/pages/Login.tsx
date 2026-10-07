import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { token, login, isLoggingIn, loginError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <div style={{ width: '100%', maxWidth: '380px', marginBottom: '16px' }}>
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

      {/* Login Card */}
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
            Log in to your workspace
          </h1>
          <p style={{ fontSize: '12px', color: '#6F7887', margin: 0 }}>
            Access and manage your saved codebases
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
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="login-email"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: '#A0A8B5',
                marginBottom: '6px',
              }}
            >
              Email or Username
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
                id="login-email"
                type="text"
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
              htmlFor="login-password"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: '#A0A8B5',
                marginBottom: '6px',
              }}
            >
              Password
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
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
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
                <span>Signing in...</span>
              </>
            ) : (
              'Sign In'
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
          <span>Don't have an account? </span>
          <Link
            to="/signup"
            style={{
              color: '#5B8DEF',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
};
