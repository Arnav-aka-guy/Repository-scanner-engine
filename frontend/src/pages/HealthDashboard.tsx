import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { apiGet } from '../services/api';
import {
  HealthScore,
  TechDebt,
  DependencyRisk,
} from '../components/health/HealthTypes';
import { HealthOverview } from '../components/health/HealthOverview';
import { HealthCategoryBreakdown } from '../components/health/HealthCategoryBreakdown';
import { TechnicalDebtPanel } from '../components/health/TechnicalDebtPanel';
import { DependencyRiskPanel } from '../components/health/DependencyRiskPanel';

/* ─── Skeleton Pulse & Loading Skeleton ────────────────────────── */

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

/* ─── Main HealthDashboard Page ────────────────────────────────── */

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
        <div
          style={{
            maxWidth: 400,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-surface, rgba(20, 20, 35, 0.6))',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <AlertTriangle size={28} style={{ color: '#ef4444' }} />
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {error}
          </span>
        </div>
      </div>
    );
  }

  if (!healthScore) return null;

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
        {/* Hero Score + Summary */}
        <HealthOverview healthScore={healthScore} />

        {/* Dimension Cards */}
        <HealthCategoryBreakdown dimensions={healthScore.dimensions} />

        {/* Tech Debt Section */}
        {techDebt && <TechnicalDebtPanel techDebt={techDebt} />}

        {/* Dependency Risk Section */}
        {depRisk && <DependencyRiskPanel depRisk={depRisk} />}
      </motion.div>
    </div>
  );
};

export default HealthDashboard;
