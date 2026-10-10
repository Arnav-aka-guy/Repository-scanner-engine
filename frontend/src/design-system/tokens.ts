// Design tokens — single source of truth for all visual values
// Follows .agents/skills/design-direction/SKILL.md ("survey map for code")
// and preserves Phase 0 baseline token assertions.

export const colors = {
  bg: {
    primary: '#0F1115',
    surface: '#151922',
    surfaceSecondary: '#1B2028',
    elevated: '#262B28',
    ground: '#0D0F0E',
  },
  border: {
    default: '#292F38',
    subtle: '#1C201D',
    strong: '#3A423D',
  },
  text: {
    primary: '#E6EAF0',
    secondary: '#8A928B',
    muted: '#5E645F',
    disabled: '#3A423D',
  },
  accent: {
    signal: '#F2A93B',
    signalSubtle: 'rgba(242, 169, 59, 0.12)',
    signalMuted: 'rgba(242, 169, 59, 0.08)',
    edge: '#7CC4C9',
    edgeSubtle: 'rgba(124, 196, 201, 0.12)',
    blue: '#5B8DEF',
    blueSubtle: 'rgba(91, 141, 239, 0.12)',
    blueMuted: 'rgba(91, 141, 239, 0.08)',
    purple: '#9580CA',
    purpleSubtle: 'rgba(149, 128, 202, 0.1)',
  },
  status: {
    success: '#4CAF79',
    successSubtle: 'rgba(76, 175, 121, 0.1)',
    successBorder: 'rgba(76, 175, 121, 0.2)',
    warning: '#C9943A',
    warningSubtle: 'rgba(201, 148, 58, 0.1)',
    warningBorder: 'rgba(201, 148, 58, 0.2)',
    danger: '#C95A5A',
    dangerSubtle: 'rgba(201, 90, 90, 0.1)',
    dangerBorder: 'rgba(201, 90, 90, 0.2)',
    info: '#5B8DEF',
    infoSubtle: 'rgba(91, 141, 239, 0.1)',
    infoBorder: 'rgba(91, 141, 239, 0.2)',
  },
} as const;

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '10px',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
} as const;

export const heights = {
  header: '36px',
  statusBar: '26px',
  sidebarWidth: '56px',
  buttonSm: '26px',
  buttonMd: '32px',
  buttonLg: '38px',
  inputSm: '28px',
  inputMd: '34px',
} as const;

export const font = {
  sans: "Inter, 'IBM Plex Sans', system-ui, -apple-system, sans-serif",
  display: "'Bricolage Grotesque', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  size: {
    xs: '11px',
    sm: '12px',
    md: '13px',
    base: '14px',
    lg: '16px',
    xl: '20px',
    '2xl': '28px',
    '3xl': '40px',
    '4xl': '64px',
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const transition = {
  fast: '0.15s cubic-bezier(0.22, 1, 0.36, 1)',
  base: '0.3s cubic-bezier(0.22, 1, 0.36, 1)',
  slow: '0.6s cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export const shadow = {
  sm: 'none',
  md: 'none',
  lg: '0 4px 16px rgba(0, 0, 0, 0.4)',
} as const;
