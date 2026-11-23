// Design tokens: the single source of truth for colours, sizes and type.
// Keep in sync with the CSS variables in index.css.

export const colors = {
  bg: {
    primary: '#000000',
    surface: '#0D0D10',
    surfaceSecondary: '#141418',
    elevated: '#1B1B20',
    ground: '#000000',
  },
  border: {
    default: '#222228',
    subtle: '#18181C',
    strong: '#33333B',
  },
  text: {
    primary: '#F4F4F5',
    secondary: '#9A9AA3',
    muted: '#6B6B75',
    disabled: '#45454D',
  },
  accent: {
    signal: '#35D7FF',
    signalSubtle: 'rgba(53, 215, 255, 0.12)',
    signalMuted: 'rgba(53, 215, 255, 0.07)',
    edge: '#3DDC97',
    edgeSubtle: 'rgba(61, 220, 151, 0.12)',
    blue: '#35D7FF',
    blueSubtle: 'rgba(53, 215, 255, 0.12)',
    blueMuted: 'rgba(53, 215, 255, 0.07)',
    purple: '#9D8CFF',
    purpleSubtle: 'rgba(157, 140, 255, 0.12)',
  },
  status: {
    success: '#3DDC97',
    successSubtle: 'rgba(61, 220, 151, 0.1)',
    successBorder: 'rgba(61, 220, 151, 0.28)',
    warning: '#FFB020',
    warningSubtle: 'rgba(255, 176, 32, 0.1)',
    warningBorder: 'rgba(255, 176, 32, 0.28)',
    danger: '#FF5C7A',
    dangerSubtle: 'rgba(255, 92, 122, 0.1)',
    dangerBorder: 'rgba(255, 92, 122, 0.28)',
    info: '#9D8CFF',
    infoSubtle: 'rgba(157, 140, 255, 0.1)',
    infoBorder: 'rgba(157, 140, 255, 0.28)',
  },
} as const;

/** Vibrant palette for charts, languages and graph categories. */
export const dataColors = ['#35D7FF', '#9D8CFF', '#3DDC97', '#FFB020', '#FF5C7A', '#FF9F43', '#FFD23F', '#8FE7FF'] as const;

export const spectrum = 'linear-gradient(90deg, #35D7FF 0%, #9D8CFF 38%, #FF5C7A 70%, #FFB020 100%)';

export const radius = {
  sm: '5px',
  md: '7px',
  lg: '12px',
  xl: '16px',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
} as const;

export const heights = {
  header: '52px',
  statusBar: '28px',
  sidebarWidth: '240px',
  buttonSm: '28px',
  buttonMd: '34px',
  buttonLg: '40px',
  inputSm: '30px',
  inputMd: '36px',
} as const;

export const font = {
  sans: "'Hanken Grotesk Variable', 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif",
  display: "'Hanken Grotesk Variable', 'Hanken Grotesk', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace",
  size: {
    xs: '12px',
    sm: '13px',
    md: '14px',
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
  md: '0 1px 0 rgba(255, 255, 255, 0.03) inset',
  lg: '0 16px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06)',
} as const;
