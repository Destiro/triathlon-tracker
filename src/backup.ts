import { Activity, mergeActivities } from './activities';
import { toKey } from './dates';
import { HealthByDate, mergeHealth } from './health/summary';
import { NO_EDITS, PlanEdits } from './plan/edits';
import type { Settings } from './settings';

// Everything you would miss if the phone were lost, as one file you keep somewhere else (Google Drive, say).
// The app's own storage lives only on the phone, so this file is the only copy of workouts saved from Strava.

const APP = 'triathlon-tracker';
const VERSION = 1;

export interface BackupData {
  settings: Settings;
  activities: Activity[];
  edits: PlanEdits;
  /** Swims corrected to pool (false) or open water (true), by activity id. */
  waterOverrides: Record<string, boolean>;
  health: HealthByDate;
}

/** An error whose message is fine to show to the person using the app. */
export class BackupError extends Error {}

export const backupFileName = (now: Date) => `triathlon-tracker-backup-${toKey(now)}.json`;

export function makeBackup(data: BackupData, now: Date): string {
  return JSON.stringify({ app: APP, version: VERSION, exportedAt: now.toISOString(), data });
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isActivity = (v: unknown): v is Activity =>
  isObject(v) && typeof v.id === 'number' && typeof v.start === 'string' && typeof v.date === 'string' && typeof v.sport === 'string';

/** Reads a backup file, keeping whatever in it is usable. Throws a BackupError for a file that isn't one. */
export function readBackup(text: string): { data: BackupData; exportedAt: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not a Triathlon Tracker backup.');
  }
  if (!isObject(parsed) || parsed.app !== APP || !isObject(parsed.data)) throw new BackupError('That file is not a Triathlon Tracker backup.');
  if (typeof parsed.version !== 'number' || parsed.version > VERSION) throw new BackupError('That backup is from a newer version of the app. Update the app first.');
  const d = parsed.data;
  if (!isObject(d.settings)) throw new BackupError('That backup is missing its settings, so it was not restored.');
  return {
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    data: {
      settings: d.settings as unknown as Settings,
      activities: Array.isArray(d.activities) ? d.activities.filter(isActivity) : [],
      edits: isObject(d.edits) ? { ...NO_EDITS, ...(d.edits as Partial<PlanEdits>) } : NO_EDITS,
      waterOverrides: isObject(d.waterOverrides) ? (d.waterOverrides as Record<string, boolean>) : {},
      health: isObject(d.health) ? (d.health as HealthByDate) : {},
    },
  };
}

/**
 * What the phone holds after restoring a backup. Nothing on the phone is dropped: workouts, health days and swim
 * corrections in the backup are added where the phone is missing them, and the phone's own copy wins where both have
 * one. The plan changes and settings are the backup's, since bringing those back is the point of restoring.
 */
export function restoreInto(current: BackupData, backup: BackupData): BackupData {
  return {
    settings: { ...current.settings, ...backup.settings },
    activities: mergeActivities(backup.activities, current.activities),
    edits: backup.edits,
    waterOverrides: { ...backup.waterOverrides, ...current.waterOverrides },
    health: mergeHealth(backup.health, current.health),
  };
}

/** A short description, such as "112 workouts and 140 days of health". */
export function describeBackup(data: Pick<BackupData, 'activities' | 'health'>): string {
  const workouts = data.activities.length;
  const days = Object.keys(data.health).length;
  return `${workouts} workout${workouts === 1 ? '' : 's'} and ${days} day${days === 1 ? '' : 's'} of health`;
}
