import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ShieldCheck,
  FileCode,
  Layers,
  BookOpen,
  Bug,
  TrendingDown,
} from 'lucide-react';
import { Dimension } from './HealthTypes';

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

export const MiniBar: React.FC<{
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

export const HealthCategoryBreakdown: React.FC<{ dimensions: Dimension[] }> = ({
  dimensions,
}) => {
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
        Health Dimensions
      </span>
      <div
        className="flex flex-wrap gap-4"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: '12px',
        }}
      >
        {dimensions.map((dim, i) => {
          const color = dimensionColors[dim.name] || 'var(--accent-cyan)';
          return (
            <motion.div
              key={dim.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <div
                style={{
                  background: 'var(--bg-surface, rgba(20, 20, 35, 0.6))',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  height: '100%',
                }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color }}>
                    {dimensionIcons[dim.name] || <Activity size={16} />}
                  </span>
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
                    {dim.deductions.slice(0, 3).map((d, idx) => {
                      const reason = typeof d === 'string' ? d : d.reason;
                      const amount = typeof d === 'object' && d !== null ? d.amount : null;
                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5"
                          style={{
                            fontSize: '0.6rem',
                            color: 'var(--text-muted)',
                            lineHeight: 1.4,
                          }}
                        >
                          <TrendingDown
                            size={10}
                            style={{ marginTop: 1, flexShrink: 0, color: '#ef4444' }}
                          />
                          <span>
                            {reason}{' '}
                            {amount !== null && (
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                −{amount}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {dim.deductions.length > 3 && (
                      <span
                        style={{
                          fontSize: '0.55rem',
                          color: 'var(--text-muted)',
                          paddingLeft: 16,
                        }}
                      >
                        +{dim.deductions.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
