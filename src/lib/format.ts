import { PlanSport, Sport, Units } from '../types';

export const METRES_PER_MILE = 1609.344;
export const METRES_PER_YARD = 0.9144;

/** "1:02:03" for an hour or more, "45:07" otherwise. Negative or missing values read as 0:00. */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "1h 25m", "45m" or "0m": for totals where seconds don't matter. */
export function formatHours(totalSec: number): string {
  const min = Math.round(Math.max(0, totalSec) / 60);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`;
}

/**
 * Reads a duration typed by hand: "1:02:03", "45:30", "45" (minutes) or "1h 20m".
 * Returns seconds, or null if it can't be read.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const hm = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?$/);
  if (hm && (hm[1] || hm[2] || hm[3])) {
    return Math.round(Number(hm[1] ?? 0) * 3600 + Number(hm[2] ?? 0) * 60 + Number(hm[3] ?? 0));
  }
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return Math.round(nums[0] * 60);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return Math.round(nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2]);
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** "10.25 km" or "6.37 mi". Below 1 km (metric) it reads in metres. */
export function formatDistance(metres: number, units: Units): string {
  if (units === 'imperial') return `${round(metres / METRES_PER_MILE, 2).toFixed(2)} mi`;
  // Decided on the rounded value, so 999.7 m reads "1.00 km" rather than "1000 m".
  if (Math.round(metres) < 1000) return `${Math.round(metres)} m`;
  return `${round(metres / 1000, 2).toFixed(2)} km`;
}

/** Swim distances read in metres or yards, never km or miles. */
export function formatSwimDistance(metres: number, units: Units): string {
  return units === 'imperial' ? `${Math.round(metres / METRES_PER_YARD)} yd` : `${Math.round(metres)} m`;
}

/** Distance in the unit people usually think in for each sport. */
export function formatSportDistance(sport: Sport, metres: number, units: Units): string {
  return sport === 'swim' ? formatSwimDistance(metres, units) : formatDistance(metres, units);
}

/** Running pace, "5:12 /km" or "8:22 /mi". Empty distance gives "--". */
export function formatPace(durationSec: number, metres: number, units: Units): string {
  if (metres <= 0 || durationSec <= 0) return '--';
  const perUnit = units === 'imperial' ? METRES_PER_MILE : 1000;
  return `${formatDuration((durationSec / metres) * perUnit)} /${units === 'imperial' ? 'mi' : 'km'}`;
}

/** Swim pace per 100 m or 100 yd. */
export function formatSwimPace(durationSec: number, metres: number, units: Units): string {
  if (metres <= 0 || durationSec <= 0) return '--';
  const per = units === 'imperial' ? 100 * METRES_PER_YARD : 100;
  return `${formatDuration((durationSec / metres) * per)} /100${units === 'imperial' ? 'yd' : 'm'}`;
}

/** Cycling speed, "28.4 km/h" or "17.6 mph". */
export function formatSpeed(durationSec: number, metres: number, units: Units): string {
  if (metres <= 0 || durationSec <= 0) return '--';
  const perHour = (metres / durationSec) * 3600;
  return units === 'imperial' ? `${round(perHour / METRES_PER_MILE, 1).toFixed(1)} mph` : `${round(perHour / 1000, 1).toFixed(1)} km/h`;
}

/** The way each sport is usually measured: pace for running, speed for cycling, per-100 for swimming. */
export function formatSportPace(sport: Sport, durationSec: number, metres: number, units: Units): string {
  if (sport === 'swim') return formatSwimPace(durationSec, metres, units);
  if (sport === 'bike') return formatSpeed(durationSec, metres, units);
  if (sport === 'run') return formatPace(durationSec, metres, units);
  return '--';
}

/** Reads a typed distance in the person's units (km or miles; metres or yards for swims) into metres. */
export function parseDistance(text: string, sport: Sport, units: Units): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || text.trim() === '') return null;
  if (sport === 'swim') return Math.round(units === 'imperial' ? n * METRES_PER_YARD : n);
  return Math.round(units === 'imperial' ? n * METRES_PER_MILE : n * 1000);
}

/** The unit label to show next to a distance box for a sport. */
export function distanceUnitLabel(sport: Sport, units: Units): string {
  if (sport === 'swim') return units === 'imperial' ? 'yd' : 'm';
  return units === 'imperial' ? 'mi' : 'km';
}

const LABELS: Record<Sport | PlanSport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  transition: 'Transition',
  brick: 'Brick',
  rest: 'Rest',
  race: 'Race',
};

export const sportLabel = (sport: Sport | PlanSport): string => LABELS[sport];

/** "Today", "Tomorrow", "in 12 days" or "3 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
