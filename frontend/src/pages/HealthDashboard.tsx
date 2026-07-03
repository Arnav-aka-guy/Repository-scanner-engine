import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiGet } from '../services/api';
import { motion } from 'framer-motion';
import {
  Activity,
  ShieldCheck,
  FileCode,
  Layers,
  BookOpen,
  Bug,
  AlertTriangle,
  Package,
  TrendingDown,
  ChevronRight,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────── */

interface Deduction {
  reason: string;
  amount: number;
}

interface Dimension {
  name: string;
  score: number;
  max_score: number;
  deductions: Deduction[];
}

interface HealthScore {
  total_score: number;
  grade: string;
  summary: string;
  dimensions: Dimension[];
}

interface TopOffender {
  path: string;
  debt_score: number;
  smell_count: number;
}

interface TechDebt {
  total_debt_score: number;
  debt_rating: string;
  total_smells: number;
  smells_by_category: Record<string, number>;
  smells_by_severity: Record<string, number>;
  suggestions: string[];
  top_offenders: TopOffender[];
}

interface DependencyRisk {
  total_dependencies: number;
  python_deps: number;
  node_deps: number;
  pinning_score: number;
  risk_summary: Record<string, number>;
  suggestions: string[];
  dependencies: any[];
}

/* ─── Circular Score SVG ────────────────────────────────────── */

const CircularScore = ({ score, grade }: { score: number; grade: string }) => {
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

/* ─── Dimension Icon Mapping ────────────────────────────────── */

const dimensionIcons: Record<string, React.ReactNode> = {
  Documentation: <BookOpen size={16} />,
  Complexity: <Layers size={16} />,
  Architecture: <FileCode size={16} />,
  Maintainability: <Bug size={16} />,
  Security: <ShieldCheck size={16} />,
};

const dimensionColors: Record<string, string> = {
  Documentation: 'var(--accent-cyan)',
  Complexity: 'var(--accent-purple)',
  Architecture: 'var(--accent-primary)',
  Maintainability: 'var(--accent-green)',
  Security: '#f59e0b',
};

/* ─── Glass Card Wrapper ────────────────────────────────────── */

const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: 'var(--bg-surface, rgba(20, 20, 35, 0.6))',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '20px',
      ...style,
    }}
  >
    {children}
  </div>
);

/* ─── Skeleton Pulse ────────────────────────────────────────── */

const SkeletonPulse: React.FC<{ width?: string; height?: string }> = ({
  width = '100%',
  height = '16px',
}) => (
  <div
    style={{
      width,
      height,
      borderRadius: '6px',
      background:
        'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
    }}
  />
);

/* ─── Loading Skeleton ──────────────────────────────────────── */

const LoadingSkeleton: React.FC = () => (
  <div className="flex flex-col gap-6" style={{ padding: '32px' }}>
    <style>{`
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
    <div className="flex items-center gap-6">
      <SkeletonPulse width="160px" height="160px" />
      <div className="flex flex-col gap-3 flex-1">
        <SkeletonPulse width="60%" height="24px" />
        <SkeletonPulse width="80%" height="14px" />
        <SkeletonPulse width="40%" height="14px" />
      </div>
    </div>
    <div className="flex gap-4 flex-wrap">
      {[1, 2, 3, 4, 5].map((i) => (
        <SkeletonPulse key={i} width="180px" height="120px" />
      ))}
    </div>
    <SkeletonPulse height="200px" />
  </div>
);

/* ─── Mini Bar ──────────────────────────────────────────────── */

const MiniBar: React.FC<{
  value: number;
  max: number;
  color: string;
}> = ({ value, max, color }) => (
  <div
    style={{
      width: '100%',
      height: '6px',
      borderRadius: '3px',
      background: 'rgba(255,255,255,0.04)',
      overflow: 'hidden',
    }}
  >
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${(value / max) * 100}%` }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      style={{
        height: '100%',
        borderRadius: '3px',
        background: color,
        boxShadow: `0 0 8px ${color}40`,
      }}
    />
  </div>
);

/* ─── Main Component ────────────────────────────────────────── */

export const HealthDashboard: React.FC = () => {
  const repoPath = useWorkspaceStore((s) => s.activeRepository);

  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [techDebt, setTechDebt] = useState<TechDebt | null>(null);
  const [depRisk, setDepRisk] = useState<DependencyRisk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath) {
      setHealthScore(null);
      setTechDebt(null);
      setDepRisk(null);
      return;
    }

    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [hs, td, dr] = await Promise.all([
          apiGet<HealthScore>('/health-score', { repo_path: repoPath }),
          apiGet<TechDebt>('/tech-debt', { repo_path: repoPath }),
          apiGet<DependencyRisk>('/dependency-risk', { repo_path: repoPath }),
        ]);
        if (!cancelled) {
          setHealthScore(hs);
          setTechDebt(td);
          setDepRisk(dr);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load health data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  /* ── Empty state ── */
  if (!repoPath) {
    return (
      <div
        className="flex-grow flex flex-col items-center justify-center gap-4"
        style={{ color: 'var(--text-muted)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'var(--bg-surface, rgba(20,20,35,0.6))',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={24} />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Health Dashboard
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                maxWidth: 300,
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              Scan a repository in the Explorer view to analyze code health,
              tech debt, and dependency risks.
            </span>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading) return <LoadingSkeleton />;

  /* ── Error state ── */
  if (error) {
    return (
      <div
        className="flex-grow flex items-center justify-center"
        style={{ padding: '32px' }}
      >
        <GlassCard
          style={{
            maxWidth: 400,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertTriangle
            size={28}
            style={{ color: '#ef4444' }}
          />
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {error}
          </span>
        </GlassCard>
      </div>
    );
  }

  if (!healthScore) return null;

  const categoryEntries = Object.entries(techDebt?.smells_by_category || {});
  const maxCategoryVal = Math.max(...categoryEntries.map(([, v]) => v), 1);

  return (
    <div
      className="flex-grow overflow-y-auto scrollbar-thin"
      style={{ padding: '28px 32px', background: 'var(--bg-primary)' }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-7"
        style={{ maxWidth: 1100, margin: '0 auto' }}
      >
        {/* ── Hero: Score + Summary ── */}
        <GlassCard
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '32px',
            flexWrap: 'wrap',
          }}
        >
          <CircularScore
            score={healthScore.total_score}
            grade={healthScore.grade}
          />
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
                  background:
                    healthScore.grade === 'A'
                      ? 'rgba(166,227,161,0.1)'
                      : healthScore.grade === 'B'
                        ? 'rgba(34,211,238,0.1)'
                        : 'rgba(245,158,11,0.1)',
                  border: `1px solid ${
                    healthScore.grade === 'A'
                      ? 'rgba(166,227,161,0.3)'
                      : healthScore.grade === 'B'
                        ? 'rgba(34,211,238,0.3)'
                        : 'rgba(245,158,11,0.3)'
                  }`,
                  color:
                    healthScore.grade === 'A'
                      ? 'var(--accent-green)'
                      : healthScore.grade === 'B'
                        ? 'var(--accent-cyan)'
                        : '#f59e0b',
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
        </GlassCard>

        {/* ── Dimension Cards ── */}
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
            Health Dimensions
          </span>
          <div
            className="flex flex-wrap gap-4"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}
          >
            {healthScore.dimensions.map((dim, i) => {
              const color = dimensionColors[dim.name] || 'var(--accent-cyan)';
              return (
                <motion.div
                  key={dim.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                >
                  <GlassCard
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      height: '100%',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color }}>{dimensionIcons[dim.name] || <Activity size={16} />}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {dim.name}
                      </span>
                    </div>
                    <div className="flex items-end gap-1">
                      <span
                        style={{
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          color,
                          lineHeight: 1,
                        }}
                      >
                        {dim.score}
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--text-muted)',
                          marginBottom: '2px',
                        }}
                      >
                        / {dim.max_score}
                      </span>
                    </div>
                    <MiniBar value={dim.score} max={dim.max_score} color={color} />
                    {dim.deductions.length > 0 && (
                      <div className="flex flex-col gap-1" style={{ marginTop: '4px' }}>
                        {dim.deductions.slice(0, 3).map((d, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-1.5"
                            style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.4 }}
                          >
                            <TrendingDown size={10} style={{ marginTop: 1, flexShrink: 0, color: '#ef4444' }} />
                            <span>
                              {d.reason}{' '}
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                −{d.amount}
                              </span>
                            </span>
                          </div>
                        ))}
                        {dim.deductions.length > 3 && (
                          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', paddingLeft: 16 }}>
                            +{dim.deductions.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── Tech Debt Section ── */}
        {techDebt && (
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
              Technical Debt
            </span>
            <div className="flex gap-4 flex-wrap">
              {/* Debt Overview */}
              <GlassCard style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
              </GlassCard>

              {/* Top Offenders */}
              <GlassCard style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
              </GlassCard>
            </div>
          </div>
        )}

        {/* ── Dependency Risk Section ── */}
        {depRisk && (
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
            <GlassCard
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
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
                    <span style={{
                      fontWeight: 700,
                      color: level === 'high' ? '#ef4444' : level === 'medium' ? '#f59e0b' : 'var(--accent-green)',
                    }}>
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
            </GlassCard>
          </div>
        )}
      </motion.div>
    </div>
  );
};
