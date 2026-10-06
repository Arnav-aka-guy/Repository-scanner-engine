import React from 'react';
import { motion } from 'framer-motion';

interface ScanProgressProps {
  /** 0–100 progress value, or -1 for indeterminate */
  progress?: number;
  label?: string;
}

export const ScanProgress: React.FC<ScanProgressProps> = ({
  progress = -1,
  label = 'Indexing repository...',
}) => {
  const isIndeterminate = progress < 0;

  return (
    <div className="flex flex-col gap-2 w-full max-w-xs mx-auto">
      {/* Label & Percentage */}
      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <span>{label}</span>
        {!isIndeterminate && <span>{Math.round(progress)}%</span>}
      </div>

      {/* Progress Track */}
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        {isIndeterminate ? (
          /* Restrained blue slide animation for indeterminate state */
          <motion.div
            className="h-full rounded-full"
            style={{
              width: '35%',
              backgroundColor: 'var(--accent-primary)',
            }}
            animate={{ x: ['-20%', '280%'] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ) : (
          /* Determinate progress fill */
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: 'var(--accent-primary)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        )}
      </div>
    </div>
  );
};
