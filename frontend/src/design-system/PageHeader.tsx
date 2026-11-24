import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Put actions on their own row under the title (for pages with many actions). */
  stacked?: boolean;
}

/** Shared page heading: title on the left, actions on the right, wraps cleanly on small screens. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, meta, icon, actions, className = '', stacked = false }) => (
  <header
    className={`flex flex-col gap-5 border-b border-line-soft pb-6 ${stacked ? '' : 'lg:flex-row lg:items-end lg:justify-between'} ${className}`}
  >
    <div className="flex min-w-0 items-start gap-3.5">
      {icon && (
        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-surface text-fg-2">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="display truncate text-[26px] leading-tight sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[720px] text-[14.5px] leading-relaxed text-fg-3">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-fg-3">{meta}</div>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);
