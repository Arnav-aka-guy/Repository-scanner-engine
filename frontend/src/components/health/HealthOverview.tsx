import React from 'react';
import { HealthScore } from './HealthTypes';

/* ─── Circular Score SVG ────────────────────────────────────── */

export const CircularScore: React.FC<{ score: number; grade: string }> = ({ score, grade }) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80
      ? 'var(--accent-green)'
      : score >= 60
        ? 'var(--accent-cyan)'
        : score >= 40
          ? '#f59e0b'
          : '#ef4444';

  return (
    <div style={{ position: 'relative', width: 160, height: 160 }}>
      <svg width={160} height={160}>
        <circle
          cx={80}
          cy={80}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={8}
        />
        <circle
          cx={80}
          cy={80}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '2.5rem', fontWeight: 700, color }}>
          {Math.round(score)}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
          }}
        >
          GRADE {grade}
        </span>
      </div>
    </div>
  );
};

/* ─── HealthOverview Hero Component ─────────────────────────── */

export const HealthOverview: React.FC<{ healthScore: HealthScore }> = ({ healthScore }) => {
  const gradeBg =
    healthScore.grade === 'A'
      ? 'rgba(166,227,161,0.1)'
      : healthScore.grade === 'B'
        ? 'rgba(34,211,238,0.1)'
        : 'rgba(245,158,11,0.1)';

  const gradeBorder =
    healthScore.grade === 'A'
      ? 'rgba(166,227,161,0.3)'
      : healthScore.grade === 'B'
        ? 'rgba(34,211,238,0.3)'
        : 'rgba(245,158,11,0.3)';

  const gradeColor =
    healthScore.grade === 'A'
      ? 'var(--accent-green)'
      : healthScore.grade === 'B'
        ? 'var(--accent-cyan)'
        : '#f59e0b';

  return (
    <div
      style={{
        background: 'var(--bg-surface, rgba(20, 20, 35, 0.6))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '32px',
        flexWrap: 'wrap',
      }}
    >
      <CircularScore score={healthScore.total_score} grade={healthScore.grade} />
      <div className="flex flex-col gap-2 flex-1" style={{ minWidth: 200 }}>
        <div className="flex items-center gap-3">
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Repository Health
          </span>
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              background: gradeBg,
              border: `1px solid ${gradeBorder}`,
              color: gradeColor,
              letterSpacing: '0.08em',
            }}
          >
            GRADE {healthScore.grade}
          </span>
        </div>
        <span
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          {healthScore.summary}
        </span>
      </div>
    </div>
  );
};
