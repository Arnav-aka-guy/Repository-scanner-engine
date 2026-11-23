import React, { useId } from 'react';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/** Three linked nodes drawn with the spectrum gradient: the product mark. */
export const LogoMark: React.FC<LogoMarkProps> = ({ size = 22, className }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`lg-${id}`} x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#35D7FF" />
          <stop offset="0.45" stopColor="#9D8CFF" />
          <stop offset="0.75" stopColor="#FF5C7A" />
          <stop offset="1" stopColor="#FFB020" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="#0D0D10" stroke="#2A2A31" />
      <path d="M7 16.5 L12 7 L17.5 15" stroke={`url(#lg-${id})`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16.5 H17.5" stroke="#3A3A43" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="7" r="2" fill="#35D7FF" />
      <circle cx="7" cy="16.5" r="2" fill="#F4F4F5" />
      <circle cx="17.5" cy="15.5" r="2" fill="#FFB020" />
    </svg>
  );
};

export const Wordmark: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 22 }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <LogoMark size={size} />
    <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg">Repository Scanner</span>
  </span>
);
