import { WorkoutKind } from './plan/types';

// Central design tokens. Change these and the whole app follows.
// The look is "Night session": a dark navy background, bright sport colours, numbers in a monospace face.
export const colors = {
  bg: '#0A0F1A',
  surface: '#131B2B',
  ink: '#E8EDF5',
  inkSoft: '#8D98AC',
  /** For things that are there but not asking for attention, like a workout still to come. */
  inkFaint: '#56627A',
  line: '#222D41',
  accent: '#6EA8FF',
  accentSoft: '#172741',
  /** Text on top of the accent or a sport colour. They are all bright, so it is dark. */
  onAccent: '#0A0F1A',
  danger: '#F87171',
  dangerSoft: '#3A1616',
  warning: '#FBBF24',
  warningSoft: '#33290B',
  success: '#4ADE80',
  successSoft: '#0F3020',
  white: '#FFFFFF',
};

/** One colour per discipline, used for icons, chart bars, badges and the stripe down each workout card. */
export const sportColors: Record<WorkoutKind | 'other', string> = {
  swim: '#38BDF8',
  bike: '#FBBF24',
  run: '#4ADE80',
  brick: '#FB923C',
  race: '#F87171',
  gym: '#C084FC',
  other: '#94A3B8',
};

/** The same colours, deep and dark, for backgrounds and for what was planned but not yet done. */
export const sportTints: Record<WorkoutKind | 'other', string> = {
  swim: '#0D2A3B',
  bike: '#33290B',
  run: '#0F3020',
  brick: '#36200D',
  race: '#3A1616',
  gym: '#2E1F42',
  other: '#1C2433',
};

/** MaterialCommunityIcons names for each discipline. */
export const sportIcons: Record<WorkoutKind | 'other', string> = {
  swim: 'swim',
  bike: 'bike',
  run: 'run',
  brick: 'lightning-bolt',
  race: 'flag-checkered',
  gym: 'dumbbell',
  other: 'help-circle-outline',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

/** Android's built-in monospace face, so columns of numbers line up and read as data. */
const MONO = 'monospace';

export const type = {
  hero: { fontSize: 44, fontWeight: '700' as const, color: colors.ink, fontFamily: MONO, fontVariant: ['tabular-nums' as const] },
  title: { fontSize: 26, fontWeight: '700' as const, color: colors.ink },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  small: { fontSize: 13, color: colors.inkSoft },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.inkSoft, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
  number: { fontSize: 22, fontWeight: '700' as const, color: colors.ink, fontFamily: MONO, fontVariant: ['tabular-nums' as const] },
};
