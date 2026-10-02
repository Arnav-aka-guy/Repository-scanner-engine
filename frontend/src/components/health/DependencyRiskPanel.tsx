import React from 'react';
import { Package, ChevronRight } from 'lucide-react';
import { DependencyRisk } from './HealthTypes';
import { MiniBar } from './HealthCategoryBreakdown';

export const DependencyRiskPanel: React.FC<{ depRisk: DependencyRisk }> = ({ depRisk }) => {
  return (
    <div>
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: '12px',
          display: 'block',
        }}
      >
        Dependency Risk
      </span>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: 'var(--bg-surface, rgba(20, 20, 35, 0.6))',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        {/* Stats row */}
        <div className="flex flex-wrap gap-5">
          {[
            {
              label: 'Total Dependencies',
              value: depRisk.total_dependencies,
              color: 'var(--accent-cyan)',
            },
            {
              label: 'Python',
              value: depRisk.python_deps,
              color: 'var(--accent-green)',
            },
            {
              label: 'Node',
              value: depRisk.node_deps,
              color: '#f59e0b',
            },
            {
              label: 'Pinning Score',
              value: `${depRisk.pinning_score}%`,
              color: 'var(--accent-primary)',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1"
              style={{ minWidth: 100 }}
            >
              <span
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {stat.label}
              </span>
              <span
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  color: stat.color,
                }}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* Pinning bar */}
        <div className="flex flex-col gap-1">
          <span
            style={{
              fontSize: '0.6rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            Version Pinning
          </span>
          <MiniBar
            value={depRisk.pinning_score}
            max={100}
            color="var(--accent-primary)"
          />
        </div>

        {/* Risk summary */}
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <Package
            size={14}
            style={{
              display: 'inline',
              verticalAlign: 'middle',
              marginRight: 6,
              color: 'var(--accent-cyan)',
            }}
          />
          Risk Breakdown:{' '}
          {Object.entries(depRisk.risk_summary).map(([level, count]) => (
            <span key={level} style={{ marginLeft: 8 }}>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    level === 'high'
                      ? '#ef4444'
                      : level === 'medium'
                        ? '#f59e0b'
                        : 'var(--accent-green)',
                }}
              >
                {count}
              </span>{' '}
              {level}
            </span>
          ))}
        </div>

        {/* Suggestions */}
        {depRisk.suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              Recommendations
            </span>
            {depRisk.suggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-2"
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <ChevronRight
                  size={12}
                  style={{
                    marginTop: 2,
                    flexShrink: 0,
                    color: 'var(--accent-green)',
                  }}
                />
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
