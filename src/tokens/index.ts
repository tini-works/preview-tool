// L1 Design Tokens — source of truth: docs/design-tokens.md

export const colors = {
  teal: {
    50: '#E8F6F8',
    100: '#C5E9ED',
    200: '#9DD9E0',
    300: '#6EC6D0',
    400: '#40B3C3',
    500: '#13A3B5',
    600: '#0F8A99',
    700: '#0B6F7C',
    800: '#085560',
    900: '#053B43',
  },
  charcoal: {
    50: '#E8EAEB',
    100: '#C5CACC',
    200: '#9DA6AA',
    300: '#748188',
    400: '#4E5D64',
    500: '#1C2A30',
    600: '#182428',
    700: '#131D21',
    800: '#0F1719',
    900: '#0A1012',
  },
  cream: {
    50: '#FDFCFB',
    100: '#FAF8F5',
    200: '#F5F3EF',
    300: '#EFEBE5',
    400: '#E8E3DB',
    500: '#E1DBD1',
  },
  slate: {
    50: '#EEF1F3',
    100: '#D5DBDF',
    200: '#B8C3C9',
    300: '#9AABB3',
    400: '#7C939D',
    500: '#5E7A86',
    600: '#4E666F',
    700: '#3E5159',
    800: '#2E3D43',
    900: '#1F292D',
  },
  coral: {
    50: '#FDF3F0',
    100: '#FAE0D9',
    200: '#F5C7BC',
    300: '#F0AD9E',
    400: '#EC9488',
    500: '#E88A73',
    600: '#E06A4F',
    700: '#C9503A',
    800: '#A03D2D',
    900: '#772D21',
  },
  semantic: {
    success: '#22C55E',
    error: '#E06A4F',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  neutral: {
    white: '#FFFFFF',
    black: '#000000',
  },
} as const

export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  11: '2.75rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const

export const typography = {
  fonts: {
    primary: 'DM Sans',
    ios: 'system-ui',
    android: 'Roboto',
    mono: 'JetBrains Mono',
  },
  sizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    kpi: '2rem',
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    kpi: 1.2,
    tight: 1.25,
    heading: 1.35,
    snug: 1.375,
    label: 1.4,
    normal: 1.5,
    relaxed: 1.75,
  },
  letterSpacing: {
    tighter: '-0.02em',
    tight: '-0.01em',
    normal: '0',
    wide: '0.02em',
    wider: '0.05em',
  },
} as const

export const radius = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  full: '9999px',
} as const

export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(28,42,48,0.05)',
  md: '0 4px 6px rgba(28,42,48,0.07)',
  lg: '0 10px 15px rgba(28,42,48,0.08)',
  xl: '0 20px 25px rgba(28,42,48,0.1)',
  '2xl': '0 25px 50px rgba(28,42,48,0.15)',
  inner: 'inset 0 2px 4px rgba(28,42,48,0.05)',
  focus: '0 0 0 3px rgba(19,163,181,0.4)',
} as const

export const motion = {
  instant: '0ms',
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  slower: '400ms',
} as const
