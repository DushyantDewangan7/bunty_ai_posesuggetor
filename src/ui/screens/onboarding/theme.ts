// Shared visual constants for the onboarding flow. Intentionally tiny — no
// theme provider, no NativeWind, just literals the screens import directly.

export const COLORS = {
  background: '#1A1A1A',
  surface: '#242424',
  surfaceActive: '#2E2E2E',
  border: '#3A3A3A',
  borderActive: '#1AC8AA',
  text: '#F5F5F0',
  textMuted: '#9A9A92',
  accent: '#1AC8AA',
  accentPressed: '#15A88F',
  accentText: '#0A1A18',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
