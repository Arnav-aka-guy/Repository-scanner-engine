import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { LogoMark } from '../brand/Logo';

interface AuthShellProps {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Shared frame for login, signup and password pages. */
export const AuthShell: React.FC<AuthShellProps> = ({ title, subtitle, children, footer }) => (
  <div className="relative flex min-h-[100dvh] w-full flex-col bg-ink font-sans text-fg">
    <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-70" aria-hidden="true" />
    <header className="relative mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
      <Link to="/" className="flex items-center gap-2.5">
        <LogoMark size={24} />
        <span className="text-[14px] font-semibold tracking-[-0.01em]">Repository Scanner</span>
      </Link>
      <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
        <ArrowLeft size={14} />
        Back to overview
      </Link>
    </header>
    <main className="relative flex flex-1 items-start justify-center px-5 pb-16 pt-8 sm:items-center sm:pt-0">
      <div className="w-full max-w-[400px]">
        <h1 className="display text-[30px] leading-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-fg-3">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8 border-t border-line-soft pt-6 text-[14px] text-fg-3">{footer}</div>}
      </div>
    </main>
  </div>
);

export const AuthError: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-rose/30 bg-rose/[0.07] px-3.5 py-3 text-[13.5px] text-[#FF9AAE]">
    <AlertCircle size={16} className="mt-0.5 shrink-0" />
    <span>{message}</span>
  </div>
);

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  aside?: React.ReactNode;
  revealable?: boolean;
}

export const AuthField: React.FC<FieldProps> = ({ id, label, icon, aside, revealable, type, ...props }) => {
  const [shown, setShown] = useState(false);
  const inputType = revealable ? (shown ? 'text' : 'password') : type;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="text-[13.5px] font-medium text-fg-2">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-4">{icon}</span>}
        <input
          id={id}
          type={inputType}
          className={`input-premium h-11 w-full text-[14.5px] ${icon ? 'pl-10' : 'pl-3.5'} ${revealable ? 'pr-11' : 'pr-3.5'}`}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-fg-4 hover:text-fg"
            aria-label={shown ? 'Hide password' : 'Show password'}
          >
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
};
