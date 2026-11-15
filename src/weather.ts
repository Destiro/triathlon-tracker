import type { Place, Settings } from './settings';

// Turns Open-Meteo's answers into plain data, and decides "good outside" or "think indoor" from your limits.
// These functions take plain data, not the network, so they can be tested without a phone.

export interface DayWeather {
  date: string;
  /** WMO weather code: 0 clear, 61 to 65 rain, 95 and above thunderstorms. */
  code: number;
  maxC: number;
  minC: number;
  /** The highest chance of rain at any hour, in percent. */
  rainPct: number;
  /** The highest wind in km/h. */
  windKmh: number;
}

export interface SeaDay {
  date: string;
  /** Average sea surface temperature for the day, in degrees. */
  seaC: number | null;
  /** The highest wave of the day, in metres. */
  waveM: number | null;
}

export interface WeatherData {
  fetchedAt: number;
  homeKey: string;
  beachKey: string;
  home: DayWeather[];
  beach: DayWeather[];
  sea: SeaDay[];
}

/** A stable name for a place, so a saved forecast can be told apart from one for somewhere else. */
export const placeKey = (place: Place | undefined): string => (place ? `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}` : '');

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numbers = (v: unknown): (number | null)[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The first match from Open-Meteo's place search, or null. */
export function parseGeocoding(json: unknown): Place | null {
  const first = isObject(json) && Array.isArray(json.results) ? json.results[0] : undefined;
  if (!isObject(first) || typeof first.latitude !== 'number' || typeof first.longitude !== 'number' || typeof first.name !== 'string') return null;
  const where = [first.admin1, first.country].filter((x): x is string => typeof x === 'string' && x !== first.name);
  return { name: [first.name, ...where.slice(0, 1)].join(', '), latitude: first.latitude, longitude: first.longitude };
}

/** Daily weather from a forecast answer. Days without a temperature are skipped. */
export function parseForecast(json: unknown): DayWeather[] {
  const daily = isObject(json) && isObject(json.daily) ? json.daily : null;
  if (!daily) return [];
  const dates = strings(daily.time);
  const code = numbers(daily.weather_code);
  const max = numbers(daily.temperature_2m_max);
  const min = numbers(daily.temperature_2m_min);
  const rain = numbers(daily.precipitation_probability_max);
  const wind = numbers(daily.wind_speed_10m_max);
  const out: DayWeather[] = [];
  dates.forEach((date, i) => {
    if (max[i] === null || max[i] === undefined) return;
    out.push({ date, code: code[i] ?? 0, maxC: max[i]!, minC: min[i] ?? max[i]!, rainPct: rain[i] ?? 0, windKmh: wind[i] ?? 0 });
  });
  return out;
}

/** Daily sea temperature (the average of the hourly readings) and biggest wave, from a marine answer. */
export function parseMarine(json: unknown): SeaDay[] {
  if (!isObject(json)) return [];
  const daily = isObject(json.daily) ? json.daily : {};
  const hourly = isObject(json.hourly) ? json.hourly : {};
  const waveDates = strings(daily.time);
  const waves = numbers(daily.wave_height_max);
  const hourTimes = strings(hourly.time);
  const temps = numbers(hourly.sea_surface_temperature);

  const byDay = new Map<string, number[]>();
  hourTimes.forEach((t, i) => {
    const value = temps[i];
    if (value === null || value === undefined) return;
    const date = t.slice(0, 10);
    byDay.set(date, [...(byDay.get(date) ?? []), value]);
  });
  const dates = [...new Set([...waveDates, ...byDay.keys()])].sort();
  return dates.map((date) => {
    const list = byDay.get(date);
    const wave = waves[waveDates.indexOf(date)];
    return { date, seaC: list ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null, waveM: wave ?? null };
  });
}

/** An icon (a MaterialCommunityIcons name) and a few words for a WMO weather code. */
export function describeCode(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: 'weather-sunny', label: 'Clear' };
  if (code <= 2) return { icon: 'weather-partly-cloudy', label: 'Partly cloudy' };
  if (code === 3) return { icon: 'weather-cloudy', label: 'Cloudy' };
  if (code === 45 || code === 48) return { icon: 'weather-fog', label: 'Fog' };
  if (code >= 51 && code <= 57) return { icon: 'weather-rainy', label: 'Drizzle' };
  if (code === 65 || code === 67 || code === 82) return { icon: 'weather-pouring', label: 'Heavy rain' };
  if ((code >= 61 && code <= 66) || code === 80 || code === 81) return { icon: 'weather-rainy', label: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'weather-snowy', label: 'Snow' };
  if (code >= 95) return { icon: 'weather-lightning-rainy', label: 'Thunderstorms' };
  return { icon: 'weather-cloudy', label: 'Cloudy' };
}

export type Limits = Pick<Settings, 'rainLimit' | 'windLimit' | 'waveLimit' | 'wetsuitBelow'>;

export interface Call {
  ok: boolean;
  /** Why not, in a few words each. Empty when ok. */
  reasons: string[];
}

const thunder = (day: DayWeather) => day.code >= 95;

/** Whether a ride or run is worth doing outside: dry enough, not too windy, no thunderstorms. */
export function outdoorCall(day: DayWeather, limits: Limits): Call {
  const reasons: string[] = [];
  if (thunder(day)) reasons.push('thunderstorms');
  if (day.rainPct > limits.rainLimit) reasons.push(`${Math.round(day.rainPct)}% chance of rain`);
  if (day.windKmh > limits.windLimit) reasons.push(`wind to ${Math.round(day.windKmh)} km/h`);
  return { ok: reasons.length === 0, reasons };
}

/** Whether an open water swim is worth it. Rain doesn't matter in the water; waves, wind and lightning do. Null with nothing to go on. */
export function openWaterCall(day: DayWeather | undefined, sea: SeaDay | undefined, limits: Limits): Call | null {
  if (!day && !sea) return null;
  const reasons: string[] = [];
  if (day && thunder(day)) reasons.push('thunderstorms');
  if (sea?.waveM != null && sea.waveM > limits.waveLimit) reasons.push(`waves to ${sea.waveM.toFixed(1)} m`);
  if (day && day.windKmh > limits.windLimit) reasons.push(`wind to ${Math.round(day.windKmh)} km/h`);
  return { ok: reasons.length === 0, reasons };
}

/** What to wear in the water for a sea temperature. */
export function wetsuitAdvice(seaC: number | null, limits: Limits): string | null {
  if (seaC === null) return null;
  return seaC < limits.wetsuitBelow ? `Wetsuit on: the sea is under ${limits.wetsuitBelow}°.` : 'Wetsuit optional: the sea is warm.';
}

/** Rides, runs, bricks and races are done outside; swims are looked at separately, since most are in a pool. */
export const isOutdoor = (kind: string): boolean => kind === 'bike' || kind === 'run' || kind === 'brick' || kind === 'race';

export const byDay = <T extends { date: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((d) => [d.date, d]));
