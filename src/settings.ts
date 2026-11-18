import { COACH_MODELS, CoachModel, DEFAULT_COACH_MODEL } from './coach/api';

/** A town or beach found by name, with where it is. */
export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

export interface Settings {
  /** The Monday that plan week 1 starts on. */
  planStart: string;
  raceDate: string;
  raceName: string;
  /** Used to turn heart rate into training load. */
  maxHr: number;
  restHr: number;
  /** Where the forecast is for, and where ocean swims are. Unset until you choose them. */
  homePlace?: Place;
  beachPlace?: Place;
  /** When "think indoor" shows: more rain chance than this (percent), wind above this (km/h), waves above this (metres). */
  rainLimit: number;
  windLimit: number;
  waveLimit: number;
  /** Below this sea temperature the weather card says to wear a wetsuit. */
  wetsuitBelow: number;
  /** Which Claude model the coach uses. */
  coachModel: CoachModel;
}

export const DEFAULT_SETTINGS: Settings = {
  planStart: '2026-10-19',
  raceDate: '2027-03-06',
  raceName: 'Ironman 70.3 New Zealand',
  maxHr: 190,
  restHr: 55,
  rainLimit: 40,
  windLimit: 30,
  waveLimit: 1,
  wetsuitBelow: 20,
  coachModel: DEFAULT_COACH_MODEL,
};

// Versions before 8 had the race on Friday 5 March. Every version saves the whole of the settings, so that wrong
// default sits in the saved settings of every phone that ran one, and changing the default alone wouldn't move it.
const OLD_RACE_DATE = '2027-03-05';

/** Saved settings filled out with the defaults, with the old wrong race date corrected. */
export function loadSettings(saved: Partial<Settings> | undefined): Settings {
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  if (!Object.keys(COACH_MODELS).includes(settings.coachModel)) settings.coachModel = DEFAULT_COACH_MODEL;
  if (settings.raceDate === OLD_RACE_DATE && settings.raceName === DEFAULT_SETTINGS.raceName) settings.raceDate = DEFAULT_SETTINGS.raceDate;
  return settings;
}
