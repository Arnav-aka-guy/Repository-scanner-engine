import React, { useState } from 'react';
import { Loader2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { colors, font, radius, transition } from './tokens';
import { CodeBlock as CodeBlockComponent } from '../components/CodeBlock';

// ─── Button ──────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: font.sans,
  fontWeight: font.weight.medium,
  transition: `background-color ${transition.fast}, color ${transition.fast}, opacity ${transition.fast}`,
  userSelect: 'none',
  flexShrink: 0,
};

const buttonVariantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: colors.accent.blue,
    color: '#fff',
    border: 'none',
  },
  secondary: {
    backgroundColor: colors.bg.surfaceSecondary,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
  },
  ghost: {
    backgroundColor: 'transparent',
    color: colors.text.secondary,
    border: 'none',
  },
  danger: {
    backgroundColor: colors.status.danger,
    color: '#fff',
    border: 'none',
  },
};

const buttonSizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: font.size.sm, borderRadius: radius.md, height: '26px' },
  md: { padding: '6px 14px', fontSize: font.size.md, borderRadius: radius.lg, height: '32px' },
  lg: { padding: '8px 18px', fontSize: font.size.base, borderRadius: radius.lg, height: '38px' },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((
  { variant = 'secondary', size = 'md', loading, icon, children, disabled, style, ...props },
  ref
) => {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      style={{
        ...buttonBase,
        ...buttonVariantStyles[variant],
        ...buttonSizeStyles[size],
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {loading ? <Loader2 size={14} style={{ animation: 'ds-spin 1s linear infinite', flexShrink: 0 }} /> : icon}
      {children}
    </button>
  );
});
Button.displayName = 'Button';

// ─── IconButton ──────────────────────────────────────────────

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>((
  { variant = 'ghost', size = 'md', loading, disabled, children, style, ...props },
  ref
) => {
  const isDisabled = disabled || loading;
  const sizeMap: Record<ButtonSize, string> = { sm: '26px', md: '30px', lg: '36px' };
  const dim = sizeMap[size];
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      style={{
        ...buttonBase,
        ...buttonVariantStyles[variant],
        width: dim,
        height: dim,
        padding: '0',
        borderRadius: radius.md,
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {loading ? <Loader2 size={14} style={{ animation: 'ds-spin 1s linear infinite' }} /> : children}
    </button>
  );
});
IconButton.displayName = 'IconButton';

// ─── Input ───────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  inputSize?: 'sm' | 'md';
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>((
  { label, error, inputSize = 'md', leftIcon, style, id, ...props },
  ref
) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: font.size.sm,
            fontWeight: font.weight.medium,
            color: colors.text.secondary,
            fontFamily: font.sans,
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        {leftIcon && (
          <span style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: colors.text.muted,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
          }}>
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          style={{
            width: '100%',
            height: inputSize === 'sm' ? '28px' : '34px',
            padding: leftIcon ? '0 12px 0 34px' : '0 12px',
            backgroundColor: colors.bg.primary,
            color: colors.text.primary,
            border: `1px solid ${error ? colors.status.danger : colors.border.default}`,
            borderRadius: radius.lg,
            fontSize: inputSize === 'sm' ? font.size.sm : font.size.md,
            fontFamily: font.sans,
            outline: 'none',
            transition: `border-color ${transition.fast}`,
            ...style,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = colors.accent.blue;
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? colors.status.danger : colors.border.default;
            props.onBlur?.(e);
          }}
          {...props}
        />
      </div>
      {error && (
        <span style={{ fontSize: font.size.xs, color: colors.status.danger, fontFamily: font.sans }}>
          {error}
        </span>
      )}
    </div>
  );
});
Input.displayName = 'Input';

// ─── Select ──────────────────────────────────────────────────

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  inputSize?: 'sm' | 'md';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>((
  { label, error, inputSize = 'md', style, id, children, ...props },
  ref
) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.text.secondary, fontFamily: font.sans }}>
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={inputId}
        style={{
          width: '100%',
          height: inputSize === 'sm' ? '28px' : '34px',
          padding: '0 12px',
          backgroundColor: colors.bg.primary,
          color: colors.text.primary,
          border: `1px solid ${error ? colors.status.danger : colors.border.default}`,
          borderRadius: radius.lg,
          fontSize: inputSize === 'sm' ? font.size.sm : font.size.md,
          fontFamily: font.sans,
          outline: 'none',
          cursor: 'pointer',
          ...style,
        }}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span style={{ fontSize: font.size.xs, color: colors.status.danger, fontFamily: font.sans }}>{error}</span>
      )}
    </div>
  );
});
Select.displayName = 'Select';

// ─── Badge ───────────────────────────────────────────────────

export type BadgeVariant = 'default' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const badgeVariantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { backgroundColor: colors.bg.elevated, color: colors.text.secondary, border: `1px solid ${colors.border.default}` },
  blue: { backgroundColor: colors.status.infoSubtle, color: colors.accent.blue, border: `1px solid ${colors.status.infoBorder}` },
  green: { backgroundColor: colors.status.successSubtle, color: colors.status.success, border: `1px solid ${colors.status.successBorder}` },
  yellow: { backgroundColor: colors.status.warningSubtle, color: colors.status.warning, border: `1px solid ${colors.status.warningBorder}` },
  red: { backgroundColor: colors.status.dangerSubtle, color: colors.status.danger, border: `1px solid ${colors.status.dangerBorder}` },
  purple: { backgroundColor: colors.accent.purpleSubtle, color: colors.accent.purple, border: `1px solid rgba(149, 128, 202, 0.2)` },
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 7px',
      borderRadius: radius.md,
      fontSize: font.size.xs,
      fontWeight: font.weight.medium,
      fontFamily: font.sans,
      lineHeight: '16px',
      whiteSpace: 'nowrap',
      ...badgeVariantStyles[variant],
      ...style,
    }}
  >
    {children}
  </span>
);

// ─── Panel ───────────────────────────────────────────────────

export interface PanelProps {
  children: React.ReactNode;
  padding?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

export const Panel: React.FC<PanelProps> = ({ children, padding = '16px', style, className }) => (
  <div
    className={className}
    style={{
      backgroundColor: colors.bg.surface,
      border: `1px solid ${colors.border.default}`,
      borderRadius: radius.lg,
      padding,
      ...style,
    }}
  >
    {children}
  </div>
);

// ─── SectionHeader ───────────────────────────────────────────

export interface SectionHeaderProps {
  label: string;
  description?: string;
  technicalLabel?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  label,
  description,
  technicalLabel,
  action,
  style,
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', ...style }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontSize: font.size.xs,
          fontWeight: font.weight.semibold,
          color: colors.text.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontFamily: font.sans,
        }}>
          {label}
        </span>
        {technicalLabel && (
          <span style={{
            fontSize: '10px',
            fontFamily: font.mono,
            color: colors.text.muted,
            backgroundColor: colors.bg.elevated,
            padding: '1px 5px',
            borderRadius: radius.sm,
          }}>
            {technicalLabel}
          </span>
        )}
      </div>
      {description && (
        <span style={{ fontSize: font.size.sm, color: colors.text.secondary, fontFamily: font.sans }}>
          {description}
        </span>
      )}
    </div>
    {action && <div style={{ flexShrink: 0 }}>{action}</div>}
  </div>
);

// ─── Metric (with Progressive Disclosure Support) ────────────

export interface MetricProps {
  label: string;
  technicalLabel?: string;
  value: React.ReactNode;
  delta?: string;
  helperText?: string;
  info?: string;
  style?: React.CSSProperties;
}

export const Metric: React.FC<MetricProps> = ({
  label,
  technicalLabel,
  value,
  delta,
  helperText,
  info,
  style,
}) => (
  <div
    style={{
      backgroundColor: colors.bg.surface,
      border: `1px solid ${colors.border.default}`,
      borderRadius: radius.lg,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
      <span style={{
        fontSize: font.size.xs,
        fontWeight: font.weight.semibold,
        color: colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </span>
      {info && (
        <span title={info} style={{ color: colors.text.muted, cursor: 'help' }}>
          <Info size={13} />
        </span>
      )}
    </div>

    {technicalLabel && (
      <span style={{
        fontSize: '11px',
        color: colors.text.muted,
        fontFamily: font.mono,
        marginTop: '-4px',
      }}>
        {technicalLabel}
      </span>
    )}

    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <span style={{
        fontSize: font.size['2xl'],
        fontWeight: font.weight.bold,
        color: colors.text.primary,
        fontFamily: font.sans,
      }}>
        {value}
      </span>
      {delta && (
        <span style={{
          fontSize: font.size.xs,
          color: colors.status.success,
          fontFamily: font.mono,
        }}>
          {delta}
        </span>
      )}
    </div>

    {helperText && (
      <span style={{ fontSize: font.size.xs, color: colors.text.secondary }}>
        {helperText}
      </span>
    )}
  </div>
);

// ─── StatusIndicator ─────────────────────────────────────────

export type IndicatorStatus = 'online' | 'offline' | 'warning' | 'idle';

export interface StatusIndicatorProps {
  status: IndicatorStatus;
  label?: string;
  style?: React.CSSProperties;
}

const indicatorColors: Record<IndicatorStatus, string> = {
  online: colors.status.success,
  offline: colors.status.danger,
  warning: colors.status.warning,
  idle: colors.text.muted,
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', ...style }}>
    <span style={{
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: indicatorColors[status],
      flexShrink: 0,
    }} />
    {label && (
      <span style={{ fontSize: font.size.sm, color: colors.text.secondary, fontFamily: font.sans }}>
        {label}
      </span>
    )}
  </div>
);

// ─── Tooltip ─────────────────────────────────────────────────

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(-4px)',
            backgroundColor: colors.bg.elevated,
            color: colors.text.primary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.md,
            padding: '4px 8px',
            fontSize: font.size.xs,
            fontFamily: font.sans,
            whiteSpace: 'nowrap',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};

// ─── EmptyState ──────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, style }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '48px 24px',
    textAlign: 'center',
    ...style,
  }}>
    {icon && (
      <div style={{ color: colors.text.muted, opacity: 0.6 }}>
        {icon}
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{
        fontSize: font.size.base,
        fontWeight: font.weight.medium,
        color: colors.text.primary,
        fontFamily: font.sans,
      }}>
        {title}
      </span>
      {description && (
        <span style={{
          fontSize: font.size.md,
          color: colors.text.muted,
          fontFamily: font.sans,
          maxWidth: '320px',
          lineHeight: '1.5',
        }}>
          {description}
        </span>
      )}
    </div>
    {action && <div style={{ marginTop: '4px' }}>{action}</div>}
  </div>
);

// ─── LoadingState ─────────────────────────────────────────────

export interface LoadingStateProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Loading...', size = 'md', style }) => {
  const iconSize = size === 'sm' ? 16 : size === 'md' ? 20 : 28;
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      padding: '32px 16px',
      ...style,
    }}>
      <Loader2
        size={iconSize}
        style={{
          color: colors.accent.blue,
          animation: 'ds-spin 1s linear infinite',
        }}
      />
      <span style={{
        fontSize: font.size.sm,
        color: colors.text.muted,
        fontFamily: font.sans,
      }}>
        {label}
      </span>
    </div>
  );
};

// ─── DataTable ────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (item: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  style?: React.CSSProperties;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found',
  onRowClick,
  style,
}: DataTableProps<T>) {
  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        border: `1px solid ${colors.border.default}`,
        borderRadius: radius.lg,
        backgroundColor: colors.bg.surface,
        ...style,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: font.size.sm }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${colors.border.default}`, backgroundColor: colors.bg.surfaceSecondary }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '8px 12px',
                  fontSize: font.size.xs,
                  fontWeight: font.weight.semibold,
                  color: colors.text.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  width: col.width,
                  textAlign: col.align || 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: colors.text.muted,
                  fontStyle: 'italic',
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={keyExtractor(row, index)}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: index < data.length - 1 ? `1px solid ${colors.border.subtle}` : 'none',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: `background-color ${transition.fast}`,
                }}
                onMouseEnter={(e) => {
                  if (onRowClick) e.currentTarget.style.backgroundColor = colors.bg.surfaceSecondary;
                }}
                onMouseLeave={(e) => {
                  if (onRowClick) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '8px 12px',
                      color: colors.text.primary,
                      textAlign: col.align || 'left',
                    }}
                  >
                    {col.render ? col.render(row, index) : (row as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── ProgressiveDisclosure (Beginner-Friendly UX) ────────────

export interface ProgressiveDisclosureProps {
  title: string;
  technicalTitle?: string;
  summary: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  style?: React.CSSProperties;
}

export const ProgressiveDisclosure: React.FC<ProgressiveDisclosureProps> = ({
  title,
  technicalTitle,
  summary,
  children,
  defaultExpanded = false,
  style,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      style={{
        border: `1px solid ${colors.border.default}`,
        borderRadius: radius.lg,
        backgroundColor: colors.bg.surface,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: expanded ? colors.bg.surfaceSecondary : 'transparent',
          transition: `background-color ${transition.fast}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text.primary }}>
              {title}
            </span>
            {technicalTitle && (
              <span style={{
                fontSize: font.size.xs,
                fontFamily: font.mono,
                color: colors.text.muted,
                backgroundColor: colors.bg.elevated,
                padding: '1px 5px',
                borderRadius: radius.sm,
              }}>
                {technicalTitle}
              </span>
            )}
          </div>
          <span style={{ fontSize: font.size.sm, color: colors.text.secondary }}>
            {summary}
          </span>
        </div>
        <div style={{ color: colors.text.muted }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '16px', borderTop: `1px solid ${colors.border.subtle}` }}>
          {children}
        </div>
      )}
    </div>
  );
};

// ─── FilePath ─────────────────────────────────────────────────

export interface FilePathProps {
  path: string;
  showFull?: boolean;
  style?: React.CSSProperties;
}

export const FilePath: React.FC<FilePathProps> = ({ path, showFull = false, style }) => {
  const segments = path.replace(/\\/g, '/').split('/');
  const basename = segments[segments.length - 1] || path;
  const display = showFull ? path.replace(/\\/g, '/') : basename;
  return (
    <span
      title={path}
      style={{
        fontFamily: font.mono,
        fontSize: font.size.sm,
        color: colors.text.secondary,
        backgroundColor: colors.bg.elevated,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.sm,
        padding: '1px 6px',
        display: 'inline-block',
        maxWidth: '300px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {display}
    </span>
  );
};

// ─── Divider ──────────────────────────────────────────────────

export interface DividerProps {
  style?: React.CSSProperties;
  vertical?: boolean;
}

export const Divider: React.FC<DividerProps> = ({ style, vertical = false }) => (
  <div
    style={{
      ...(vertical
        ? { width: '1px', height: '100%', alignSelf: 'stretch', backgroundColor: colors.border.default }
        : { width: '100%', height: '1px', backgroundColor: colors.border.default }),
      flexShrink: 0,
      ...style,
    }}
  />
);

// ─── Re-export CodeBlock ──────────────────────────────────────
export const CodeBlock = CodeBlockComponent;

// ─── Spinner animation injection ─────────────────────────────
if (typeof document !== 'undefined') {
  const styleId = 'ds-primitives-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ds-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}
