export interface Settings {
  /** The Monday that plan week 1 starts on. */
  planStart: string;
  raceDate: string;
  raceName: string;
  /** Used to turn heart rate into training load. */
  maxHr: number;
  restHr: number;
}

export const DEFAULT_SETTINGS: Settings = {
  planStart: '2026-10-19',
  raceDate: '2027-03-06',
  raceName: 'Ironman 70.3 New Zealand',
  maxHr: 190,
  restHr: 55,
};

// Versions before 8 had the race on Friday 5 March. Every version saves the whole of the settings, so that wrong
// default sits in the saved settings of every phone that ran one, and changing the default alone wouldn't move it.
const OLD_RACE_DATE = '2027-03-05';

/** Saved settings filled out with the defaults, with the old wrong race date corrected. */
export function loadSettings(saved: Partial<Settings> | undefined): Settings {
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  if (settings.raceDate === OLD_RACE_DATE && settings.raceName === DEFAULT_SETTINGS.raceName) settings.raceDate = DEFAULT_SETTINGS.raceDate;
  return settings;
}
