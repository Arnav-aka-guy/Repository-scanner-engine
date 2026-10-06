import React from 'react';
import { AlertCircle, RefreshCw, HelpCircle, ArrowRight } from 'lucide-react';
import { colors, font, radius } from '../design-system/tokens';

export interface ErrorCardProps {
  title?: string;
  whatHappened: string;
  why?: string;
  whatCanIDo?: string | string[];
  onRetry?: () => void;
  retrying?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Phase 11 Standard Error UX Component
 * Answers:
 * 1. What happened?
 * 2. Why did it happen?
 * 3. What can I do?
 * Includes explicit [Retry] action.
 */
export const ErrorCard: React.FC<ErrorCardProps> = ({
  title = 'Something went wrong',
  whatHappened,
  why,
  whatCanIDo,
  onRetry,
  retrying = false,
  style,
  className,
}) => {
  const suggestions = Array.isArray(whatCanIDo)
    ? whatCanIDo
    : whatCanIDo
    ? [whatCanIDo]
    : [
        'Check that the backend analysis server is running on http://127.0.0.1:8000.',
        'Verify your network connection and API provider credentials.',
        'Retry the operation or rescan the repository.',
      ];

  return (
    <div
      className={className}
      style={{
        backgroundColor: colors.bg.surface,
        border: `1px solid ${colors.status.dangerBorder}`,
        borderRadius: radius.lg,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: radius.md,
              backgroundColor: colors.status.dangerSubtle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.status.danger,
              flexShrink: 0,
            }}
          >
            <AlertCircle size={15} />
          </div>
          <span
            style={{
              fontSize: font.size.base,
              fontWeight: font.weight.semibold,
              color: colors.text.primary,
              fontFamily: font.sans,
            }}
          >
            {title}
          </span>
        </div>

        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              backgroundColor: colors.bg.elevated,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              fontSize: font.size.sm,
              fontWeight: font.weight.medium,
              color: colors.text.primary,
              cursor: retrying ? 'not-allowed' : 'pointer',
              opacity: retrying ? 0.6 : 1,
              fontFamily: font.sans,
              transition: 'background-color 0.12s ease',
            }}
          >
            <RefreshCw size={12} style={{ animation: retrying ? 'ds-spin 1s linear infinite' : 'none' }} />
            <span>{retrying ? 'Retrying...' : 'Retry'}</span>
          </button>
        )}
      </div>

      {/* 3-Part Structured Body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          padding: '12px',
          backgroundColor: colors.bg.primary,
          borderRadius: radius.md,
          border: `1px solid ${colors.border.subtle}`,
        }}
      >
        {/* What happened? */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span
            style={{
              fontSize: font.size.xs,
              fontWeight: font.weight.semibold,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: colors.status.danger,
              fontFamily: font.sans,
            }}
          >
            What happened?
          </span>
          <p
            style={{
              fontSize: font.size.sm,
              color: colors.text.primary,
              margin: 0,
              lineHeight: 1.5,
              fontFamily: font.sans,
            }}
          >
            {whatHappened}
          </p>
        </div>

        {/* Why? */}
        {why && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: colors.text.muted,
                fontFamily: font.sans,
              }}
            >
              Why?
            </span>
            <p
              style={{
                fontSize: font.size.sm,
                color: colors.text.secondary,
                margin: 0,
                lineHeight: 1.5,
                fontFamily: font.sans,
              }}
            >
              {why}
            </p>
          </div>
        )}

        {/* What can I do? */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span
            style={{
              fontSize: font.size.xs,
              fontWeight: font.weight.semibold,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: colors.accent.blue,
              fontFamily: font.sans,
            }}
          >
            What can I do?
          </span>
          <ul
            style={{
              margin: 0,
              paddingLeft: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              fontSize: font.size.xs,
              color: colors.text.secondary,
              fontFamily: font.sans,
            }}
          >
            {suggestions.map((s, idx) => (
              <li key={idx} style={{ lineHeight: 1.4 }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
