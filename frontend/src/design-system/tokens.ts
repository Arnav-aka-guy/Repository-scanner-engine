// Design tokens — single source of truth for all visual values
export const colors = {
  bg: {
    primary: '#0F1115',
    surface: '#151922',
    surfaceSecondary: '#1B2028',
    elevated: '#222A35',
  },
  border: {
    default: '#292F38',
    subtle: '#1E2530',
    strong: '#3D4654',
  },
  text: {
    primary: '#E6EAF0',
    secondary: '#A0A8B5',
    muted: '#6F7887',
    disabled: '#4A5260',
  },
  accent: {
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
  sans: "Inter, system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  size: {
    xs: '11px',
    sm: '12px',
    md: '13px',
    base: '14px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const transition = {
  fast: '0.12s ease',
  base: '0.18s ease',
  slow: '0.25s ease',
} as const;

export const shadow = {
  sm: '0 1px 3px rgba(0,0,0,0.3)',
  md: '0 4px 12px rgba(0,0,0,0.35)',
  lg: '0 8px 24px rgba(0,0,0,0.4)',
} as const;
