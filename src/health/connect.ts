import { Platform } from 'react-native';
import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
  type ReadHealthDataHistoryPermission,
  type RecordResult,
  type RecordType,
} from 'react-native-health-connect';
import { Activity } from '../activities';
import { combine, HealthByDate, perDay, summarizeSleep } from './summary';
import { SessionData, sessionToActivity } from './workouts';

/** An error whose message is fine to show to the person using the app. */
export class HealthError extends Error {}

const READS: Permission[] = [
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Vo2Max' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'HeartRate' },
  // Workouts, and what the watch records during them.
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'Speed' },
  { accessType: 'read', recordType: 'ElevationGained' },
];
// Without this Health Connect only hands over the 30 days before access was first granted.
const HISTORY: ReadHealthDataHistoryPermission = { accessType: 'read', recordType: 'ReadHealthDataHistory' };

const PAGE_SIZE = 1000;

export type Availability = 'available' | 'update' | 'unavailable';

export async function availability(): Promise<Availability> {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

async function ready(): Promise<void> {
  const status = await availability();
  if (status === 'update') throw new HealthError('Health Connect needs updating. Update it from the Play Store, then try again.');
  if (status === 'unavailable') throw new HealthError('Health Connect is not available on this phone.');
  if (!(await initialize())) throw new HealthError('Could not start Health Connect. Try again.');
}

/** Asks for read access to workouts, sleep, VO2 max and heart rate. True when workouts or sleep were allowed. */
export async function connect(): Promise<boolean> {
  await ready();
  const granted = await requestPermission([...READS, HISTORY]);
  return granted.some((p) => p.recordType === 'ExerciseSession' || p.recordType === 'SleepSession');
}

/** The kinds of data you have allowed, so the app can say what is missing. */
export async function grantedTypes(): Promise<Set<string>> {
  await ready();
  return new Set((await getGrantedPermissions()).map((p) => p.recordType));
}

export const openSettings = () => openHealthConnectSettings();

async function readAll<T extends RecordType>(type: T, startTime: string, endTime: string): Promise<RecordResult<T>[]> {
  const out: RecordResult<T>[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(type, { timeRangeFilter: { operator: 'between', startTime, endTime }, pageSize: PAGE_SIZE, pageToken });
    out.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return out;
}

/** Reads one kind of data, or nothing if that kind was not allowed. */
async function readIfGranted<T extends RecordType>(granted: Set<string>, type: T, start: string, end: string): Promise<RecordResult<T>[]> {
  return granted.has(type) ? readAll(type, start, end) : [];
}

const DAY_MS = 86400000;
// Without the history permission only the 30 days before access was first granted can be read; stay just inside.
const WITHOUT_HISTORY_DAYS = 29;

export interface WorkoutRead {
  /** The workouts read in full, newest first. */
  activities: Activity[];
  /** False when reading stopped partway; the rest are read next time. */
  complete: boolean;
  /** True when older workouts were asked for but Health Connect only allows the last 30 days. */
  clipped: boolean;
}

/**
 * The workouts that started since `since` (an ISO time), each with its distance, heart rate, speed and climbing.
 * `shouldRead` skips the ones already saved, as reading each takes several requests.
 */
export async function fetchWorkoutsSince(
  since: string,
  shouldRead: (session: { startTime: string; exerciseType: number }) => boolean,
  now = new Date(),
): Promise<WorkoutRead> {
  const granted = await grantedTypes();
  if (!granted.has('ExerciseSession')) {
    throw new HealthError('Workouts are not allowed yet. In Settings, tap "Ask for access again" and allow exercise.');
  }
  const earliest = new Date(now.getTime() - WITHOUT_HISTORY_DAYS * DAY_MS).toISOString();
  const clipped = !granted.has('ReadHealthDataHistory') && since < earliest;
  const from = clipped ? earliest : since;
  const end = now.toISOString();

  let sessions: RecordResult<'ExerciseSession'>[];
  try {
    sessions = await readAll('ExerciseSession', from, end);
  } catch (e) {
    throw new HealthError('Could not read workouts from Health Connect. Try again.', { cause: e });
  }

  const wanted = sessions.filter(shouldRead).sort((a, b) => b.startTime.localeCompare(a.startTime));
  const activities: Activity[] = [];
  for (const session of wanted) {
    try {
      const [distances, heartRates, speeds, elevations] = await Promise.all([
        readIfGranted(granted, 'Distance', session.startTime, session.endTime),
        readIfGranted(granted, 'HeartRate', session.startTime, session.endTime),
        readIfGranted(granted, 'Speed', session.startTime, session.endTime),
        readIfGranted(granted, 'ElevationGained', session.startTime, session.endTime),
      ]);
      const data: SessionData = { session, distances, heartRates, speeds, elevations, calories: [] };
      const activity = sessionToActivity(data);
      if (activity) activities.push(activity);
    } catch {
      // Most likely Health Connect asking apps to slow down. Keep what was read; the rest follow next time.
      return { activities, complete: false, clipped };
    }
  }
  return { activities, complete: true, clipped };
}

/** Everything since `since` (an ISO time), summarised into days. */
export async function fetchHealthSince(since: string, now = new Date()): Promise<HealthByDate> {
  const granted = await grantedTypes();
  if (granted.size === 0) throw new HealthError('Health Connect access was turned off. Connect again in Settings.');
  const end = now.toISOString();
  try {
    const [sleep, vo2, resting, hrv] = await Promise.all([
      readIfGranted(granted, 'SleepSession', since, end),
      readIfGranted(granted, 'Vo2Max', since, end),
      readIfGranted(granted, 'RestingHeartRate', since, end),
      readIfGranted(granted, 'HeartRateVariabilityRmssd', since, end),
    ]);
    const nights = summarizeSleep(sleep);

    // Heart rate while asleep is the most reliable recovery signal a wrist watch gives, so work it out per night.
    if (granted.has('HeartRate')) {
      for (const night of Object.values(nights)) {
        const hr = await aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: { operator: 'between', startTime: night.start, endTime: night.end } });
        if (hr.MEASUREMENTS_COUNT > 0 && hr.BPM_AVG > 0) night.sleepingHr = Math.round(hr.BPM_AVG);
      }
    }

    return combine({
      nights,
      vo2Max: perDay(vo2.map((r) => ({ time: r.time, value: r.vo2MillilitersPerMinuteKilogram })), 'latest'),
      restingHr: perDay(resting.map((r) => ({ time: r.time, value: r.beatsPerMinute })), 'lowest'),
      hrv: perDay(hrv.map((r) => ({ time: r.time, value: r.heartRateVariabilityMillis })), 'average'),
    });
  } catch (e) {
    throw new HealthError('Could not read from Health Connect. Try again.', { cause: e });
  }
}
