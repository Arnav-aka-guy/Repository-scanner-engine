import React from 'react';
import { useToastStore, type ToastType } from '../stores/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} />,
  error: <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info: <Info size={16} />,
};

const colorMap: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'rgba(166, 227, 161, 0.06)',
    border: 'rgba(166, 227, 161, 0.2)',
    text: 'var(--text-primary)',
    icon: 'var(--accent-green)',
  },
  error: {
    bg: 'rgba(251, 113, 133, 0.06)',
    border: 'rgba(251, 113, 133, 0.2)',
    text: 'var(--text-primary)',
    icon: 'var(--accent-rose)',
  },
  warning: {
    bg: 'rgba(250, 204, 21, 0.06)',
    border: 'rgba(250, 204, 21, 0.2)',
    text: 'var(--text-primary)',
    icon: 'var(--accent-yellow)',
  },
  info: {
    bg: 'rgba(96, 165, 250, 0.06)',
    border: 'rgba(96, 165, 250, 0.2)',
    text: 'var(--text-primary)',
    icon: 'var(--accent-primary)',
  },
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: '380px' }}
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const colors = colorMap[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl cursor-default"
              style={{
                background: colors.bg,
                borderColor: colors.border,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5" style={{ color: colors.icon }}>
                {iconMap[toast.type]}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold" style={{ color: colors.text }}>
                  {toast.title}
                </div>
                {toast.message && (
                  <div className="text-[11px] mt-0.5 leading-relaxed text-[var(--text-secondary)]">
                    {toast.message}
                  </div>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 p-0.5 rounded transition-colors hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
