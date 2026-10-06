import React from 'react';
import { Bug, ChevronRight } from 'lucide-react';
import { TechDebt } from './HealthTypes';
import { MiniBar } from './HealthCategoryBreakdown';

export const TechnicalDebtPanel: React.FC<{ techDebt: TechDebt }> = ({ techDebt }) => {
  const categoryEntries = Object.entries(techDebt.smells_by_category || {});
  const maxCategoryVal = Math.max(...categoryEntries.map(([, v]) => v), 1);

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
            }}
          >
            Code Quality Issues
          </span>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-tertiary)',
              padding: '1px 5px',
              borderRadius: '4px',
            }}
          >
            Technical Debt
          </span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
          Identifies complexity hotspots, missing documentation, and code smells that make software harder to maintain.
        </span>
      </div>
      <div className="flex gap-4 flex-wrap">
        {/* Debt Overview */}
        <div
          style={{
            flex: '1 1 280px',
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
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(139,92,246,0.1)',
                border: '1px solid rgba(139,92,246,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-purple)',
              }}
            >
              <Bug size={18} />
            </div>
            <div className="flex flex-col">
              <span
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {techDebt.debt_rating}
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                }}
              >
                Debt Score: {techDebt.total_debt_score} · {techDebt.total_smells} code smells
              </span>
            </div>
          </div>

          {/* Category bars */}
          <div className="flex flex-col gap-3">
            {categoryEntries.map(([cat, count]) => (
              <div key={cat} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    {cat}
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {count}
                  </span>
                </div>
                <MiniBar
                  value={count}
                  max={maxCategoryVal}
                  color="var(--accent-purple)"
                />
              </div>
            ))}
          </div>

          {/* Suggestions */}
          {techDebt.suggestions.length > 0 && (
            <div className="flex flex-col gap-2" style={{ marginTop: 4 }}>
              <span
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                Suggestions
              </span>
              {techDebt.suggestions.slice(0, 4).map((s, i) => (
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
                    style={{ marginTop: 2, flexShrink: 0, color: 'var(--accent-cyan)' }}
                  />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Offenders */}
        <div
          style={{
            flex: '1 1 320px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'var(--bg-surface, rgba(20, 20, 35, 0.6))',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Top Offender Files
          </span>
          <div className="flex flex-col gap-1">
            {techDebt.top_offenders.slice(0, 8).map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3"
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background:
                    i % 2 === 0
                      ? 'rgba(255,255,255,0.015)'
                      : 'transparent',
                  fontSize: '0.7rem',
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.6rem',
                    color: 'var(--text-muted)',
                    width: 20,
                    textAlign: 'right',
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    color: 'var(--text-secondary)',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.path}
                </span>
                <span
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    color: 'var(--accent-purple)',
                    fontFamily: 'monospace',
                  }}
                >
                  {f.debt_score}
                </span>
                <span
                  style={{
                    fontSize: '0.55rem',
                    color: 'var(--text-muted)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  {f.smell_count} smells
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
