import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
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
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          backgroundColor: 'rgba(91, 141, 239, 0.1)',
          border: '1px solid rgba(91, 141, 239, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#5B8DEF',
          marginBottom: '20px',
        }}
      >
        <Compass size={28} />
      </div>

      <span
        style={{
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', monospace",
          color: '#6F7887',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '8px',
        }}
      >
        404 — Not Found
      </span>

      <h1
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: '#E6EAF0',
          margin: '0 0 10px',
        }}
      >
        Page Not Found
      </h1>

      <p
        style={{
          fontSize: '13px',
          color: '#A0A8B5',
          maxWidth: '360px',
          lineHeight: '1.6',
          margin: '0 0 24px',
        }}
      >
        The coordinate or route you requested does not exist in this repository workspace.
      </p>

      <Link
        to="/"
        className="btn-primary"
        style={{
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          fontSize: '13px',
        }}
      >
        <ArrowLeft size={14} />
        <span>Return to overview</span>
      </Link>
    </div>
  );
};
