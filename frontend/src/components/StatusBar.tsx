import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, Cpu, AlertCircle } from 'lucide-react';

/* ─── Props ─────────────────────────────────────────────────── */

interface StatusBarProps {
  repoPath?: string;
  connected?: boolean;
  totalFiles?: number;
  totalLines?: number;
}

/* ─── Status Bar ────────────────────────────────────────────── */

export const StatusBar: React.FC<StatusBarProps> = ({
  repoPath,
  connected = true,
  totalFiles = 0,
  totalLines = 0,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const, delay: 0.2 }}
      className="w-full select-none relative"
      style={{ height: '28px' }}
    >
      {/* Gradient top border line — 1px */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: '1px',
          background:
            'linear-gradient(90deg, var(--accent-primary), var(--accent-purple), var(--accent-cyan), transparent)',
          opacity: 0.35,
        }}
      />

      {/* Bar body */}
      <div
        className="w-full h-full flex items-center justify-between px-4 font-mono"
        style={{
          fontSize: '10px',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-muted)',
        }}
      >
        {/* ── Left section ── */}
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {connected ? (
              <>
                {/* Animated green pulse dot */}
                <span className="relative flex items-center justify-center" style={{ width: 10, height: 10 }}>
                  {/* Outer glow ring */}
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{
                      backgroundColor: 'var(--accent-green)',
                      opacity: 0.3,
                      animation: 'statusPulse 2s ease-in-out infinite',
                    }}
                  />
                  {/* Inner solid dot */}
                  <span
                    className="relative rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: 'var(--accent-green)',
                      boxShadow: '0 0 6px var(--accent-green)',
                    }}
                  />
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Localhost (Ready)
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={10} style={{ color: 'var(--accent-rose)' }} />
                <span style={{ color: 'var(--accent-rose)' }}>Disconnected</span>
              </>
            )}
          </div>

          {/* Repo path */}
          {repoPath ? (
            <div className="flex items-center gap-1.5 truncate" style={{ maxWidth: 400 }}>
              <Terminal size={10} />
              <span className="truncate">{repoPath}</span>
            </div>
          ) : (
            <span className="italic">No repository selected</span>
          )}
        </div>

        {/* ── Right section ── */}
        <div className="flex items-center gap-4">
          {repoPath && (
            <>
              <span>
                Files:{' '}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {totalFiles.toLocaleString()}
                </span>
              </span>
              <span>
                Lines:{' '}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {totalLines.toLocaleString()}
                </span>
              </span>
            </>
          )}

          {/* Model badge */}
          <div
            className="flex items-center gap-1 px-1.5 rounded"
            style={{
              background: 'rgba(96, 165, 250, 0.06)',
              border: '1px solid rgba(96, 165, 250, 0.1)',
              lineHeight: '18px',
            }}
          >
            <Cpu size={9} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>
              all-MiniLM-L6-v2 (CPU)
            </span>
          </div>
        </div>
      </div>

      {/* Keyframe injected via style tag — scoped to this component */}
      <style>{`
        @keyframes statusPulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </motion.div>
  );
};
