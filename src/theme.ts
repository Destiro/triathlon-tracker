import { PlanSport, Sport } from './types';

// Central design tokens. Change these and the whole app follows.
export const colors = {
  bg: '#F3F5F9',
  surface: '#FFFFFF',
  ink: '#0F172A',
  inkSoft: '#5B6474',
  line: '#E2E6EE',
  accent: '#1E5BC6',
  accentSoft: '#E3ECFB',
  danger: '#C62828',
  dangerSoft: '#FDECEC',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  success: '#15803D',
  successSoft: '#DCFCE7',
  white: '#FFFFFF',
};

/** One colour per discipline, used for icons, chart bars and badges everywhere. */
export const sportColors: Record<Sport | PlanSport | 'multisport', string> = {
  swim: '#0EA5E9',
  bike: '#F59E0B',
  run: '#16A34A',
  strength: '#8B5CF6',
  transition: '#94A3B8',
  brick: '#EA580C',
  rest: '#94A3B8',
  race: '#DC2626',
  multisport: '#1E5BC6',
};

/** MaterialCommunityIcons names for each discipline. */
export const sportIcons: Record<Sport | PlanSport | 'multisport', string> = {
  swim: 'swim',
  bike: 'bike',
  run: 'run',
  strength: 'dumbbell',
  transition: 'swap-horizontal',
  brick: 'lightning-bolt',
  rest: 'sleep',
  race: 'flag-checkered',
  multisport: 'trophy-outline',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export const type = {
  hero: { fontSize: 44, fontWeight: '800' as const, color: colors.ink, fontVariant: ['tabular-nums' as const] },
  title: { fontSize: 26, fontWeight: '800' as const, color: colors.ink },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  small: { fontSize: 13, color: colors.inkSoft },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.inkSoft, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  number: { fontSize: 22, fontWeight: '700' as const, color: colors.ink, fontVariant: ['tabular-nums' as const] },
};
