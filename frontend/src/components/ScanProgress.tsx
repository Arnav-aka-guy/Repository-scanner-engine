import React from 'react';
import { motion } from 'framer-motion';

interface ScanProgressProps {
  /** 0–100 progress value, or -1 for indeterminate */
  progress?: number;
  label?: string;
}

export const ScanProgress: React.FC<ScanProgressProps> = ({
  progress = -1,
  label = 'Indexing repository ...',
}) => {
  const isIndeterminate = progress < 0;

  return (
    <div className="flex flex-col gap-2 w-full max-w-xs mx-auto">
      {/* Label */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
        <span>{label}</span>
        {!isIndeterminate && <span>{Math.round(progress)}%</span>}
      </div>

      {/* Track */}
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        {isIndeterminate ? (
          /* Shimmer animation for indeterminate */
          <motion.div
            className="h-full rounded-full"
            style={{
              width: '40%',
              background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple), var(--accent-primary))',
              backgroundSize: '200% 100%',
            }}
            animate={{ x: ['0%', '150%'] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ) : (
          /* Determinate bar */
          <motion.div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple))',
              boxShadow: '0 0 8px var(--accent-primary)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        )}
      </div>
    </div>
  );
};
