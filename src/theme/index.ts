export const colors = {
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  primary: '#1D4ED8',
  primaryText: '#FFFFFF',
  success: '#166534',
  successBg: '#DCFCE7',
  info: '#1E40AF',
  infoBg: '#DBEAFE',
  warn: '#92400E',
  warnBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, pill: 999 } as const;
/** Minimum touch target (Android guideline 48dp). */
export const TOUCH = 48;

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
} as const;

export type Tone = 'ok' | 'busy' | 'waiting' | 'attention' | 'neutral';
export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: colors.success, bg: colors.successBg },
  busy: { fg: colors.info, bg: colors.infoBg },
  waiting: { fg: colors.warn, bg: colors.warnBg },
  attention: { fg: colors.danger, bg: colors.dangerBg },
  neutral: { fg: colors.muted, bg: colors.border },
};
