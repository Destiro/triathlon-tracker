import { Gear, Race, Settings, TrainingPlan, Workout } from '../types';

/** Bump when the saved shape changes, and teach `migrate` how to upgrade the old one. */
export const DATA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  units: 'metric',
  poolLengthM: 25,
  weeklyTargetMin: 6 * 60,
};

export interface AppData {
  version: number;
  workouts: Workout[];
  races: Race[];
  plan: TrainingPlan | null;
  gear: Gear[];
  settings: Settings;
}

export const EMPTY_DATA: AppData = { version: DATA_VERSION, workouts: [], races: [], plan: null, gear: [], settings: DEFAULT_SETTINGS };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isWorkout = (w: unknown): w is Workout =>
  isObject(w) && typeof w.id === 'string' && typeof w.startedAt === 'string' && Array.isArray(w.segments);

const isRace = (r: unknown): r is Race => isObject(r) && typeof r.id === 'string' && typeof r.date === 'string' && typeof r.name === 'string';

const isGear = (g: unknown): g is Gear => isObject(g) && typeof g.id === 'string' && typeof g.name === 'string';

/**
 * Brings anything we have ever saved up to the current shape, dropping entries that can't be understood
 * rather than failing. Throws only for data that isn't ours at all, or comes from a newer version.
 */
export function migrate(raw: unknown): AppData {
  if (!isObject(raw)) throw new Error('Saved data is not an object');
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > DATA_VERSION) throw new Error(`Saved data is from a newer app version (${version})`);

  const settings = isObject(raw.settings) ? (raw.settings as Partial<Settings>) : {};
  return {
    version: DATA_VERSION,
    workouts: Array.isArray(raw.workouts) ? raw.workouts.filter(isWorkout) : [],
    races: Array.isArray(raw.races) ? raw.races.filter(isRace) : [],
    plan: isObject(raw.plan) && Array.isArray(raw.plan.weeks) ? (raw.plan as unknown as TrainingPlan) : null,
    gear: Array.isArray(raw.gear) ? raw.gear.filter(isGear) : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      units: settings.units === 'imperial' ? 'imperial' : 'metric',
      poolLengthM: typeof settings.poolLengthM === 'number' && settings.poolLengthM > 0 ? settings.poolLengthM : DEFAULT_SETTINGS.poolLengthM,
      weeklyTargetMin:
        typeof settings.weeklyTargetMin === 'number' && settings.weeklyTargetMin > 0 ? settings.weeklyTargetMin : DEFAULT_SETTINGS.weeklyTargetMin,
    },
  };
}
