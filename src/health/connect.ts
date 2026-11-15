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
import { combine, HealthByDate, overnightReadings, perDay, summarizeSleep } from './summary';
import { SessionData, sessionToActivity } from './workouts';

/** An error whose message is fine to show to the person using the app. */
export class HealthError extends Error {}

/**
 * Everything the app asks to read. Each needs its Android permission declared in app.json as well, or the request fails
 * without a clear error; a test checks the two agree.
 */
export const READ_TYPES = [
  { recordType: 'SleepSession', permission: 'android.permission.health.READ_SLEEP' },
  { recordType: 'Vo2Max', permission: 'android.permission.health.READ_VO2_MAX' },
  { recordType: 'RestingHeartRate', permission: 'android.permission.health.READ_RESTING_HEART_RATE' },
  { recordType: 'HeartRateVariabilityRmssd', permission: 'android.permission.health.READ_HEART_RATE_VARIABILITY' },
  { recordType: 'HeartRate', permission: 'android.permission.health.READ_HEART_RATE' },
  // Workouts, and what the watch records during them.
  { recordType: 'ExerciseSession', permission: 'android.permission.health.READ_EXERCISE' },
  { recordType: 'Distance', permission: 'android.permission.health.READ_DISTANCE' },
  { recordType: 'Speed', permission: 'android.permission.health.READ_SPEED' },
  { recordType: 'ElevationGained', permission: 'android.permission.health.READ_ELEVATION_GAINED' },
  { recordType: 'TotalCaloriesBurned', permission: 'android.permission.health.READ_TOTAL_CALORIES_BURNED' },
  // Body and overnight readings. The watch may not share these; the app shows them only when they come through.
  { recordType: 'Weight', permission: 'android.permission.health.READ_WEIGHT' },
  { recordType: 'BodyFat', permission: 'android.permission.health.READ_BODY_FAT' },
  { recordType: 'LeanBodyMass', permission: 'android.permission.health.READ_LEAN_BODY_MASS' },
  { recordType: 'OxygenSaturation', permission: 'android.permission.health.READ_OXYGEN_SATURATION' },
  { recordType: 'RespiratoryRate', permission: 'android.permission.health.READ_RESPIRATORY_RATE' },
] as const;

const READS: Permission[] = READ_TYPES.map((t) => ({ accessType: 'read', recordType: t.recordType }));
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
      const [distances, heartRates, speeds, elevations, calories] = await Promise.all([
        readIfGranted(granted, 'Distance', session.startTime, session.endTime),
        readIfGranted(granted, 'HeartRate', session.startTime, session.endTime),
        readIfGranted(granted, 'Speed', session.startTime, session.endTime),
        readIfGranted(granted, 'ElevationGained', session.startTime, session.endTime),
        readIfGranted(granted, 'TotalCaloriesBurned', session.startTime, session.endTime),
      ]);
      const data: SessionData = { session, distances, heartRates, speeds, elevations, calories };
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
    const [sleep, vo2, resting, hrv, weight, fat, lean, oxygen, breathing] = await Promise.all([
      readIfGranted(granted, 'SleepSession', since, end),
      readIfGranted(granted, 'Vo2Max', since, end),
      readIfGranted(granted, 'RestingHeartRate', since, end),
      readIfGranted(granted, 'HeartRateVariabilityRmssd', since, end),
      readIfGranted(granted, 'Weight', since, end),
      readIfGranted(granted, 'BodyFat', since, end),
      readIfGranted(granted, 'LeanBodyMass', since, end),
      readIfGranted(granted, 'OxygenSaturation', since, end),
      readIfGranted(granted, 'RespiratoryRate', since, end),
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
      weight: perDay(weight.map((r) => ({ time: r.time, value: r.weight.inKilograms })), 'latest'),
      bodyFat: perDay(fat.map((r) => ({ time: r.time, value: r.percentage })), 'latest'),
      lean: perDay(lean.map((r) => ({ time: r.time, value: r.mass.inKilograms })), 'latest'),
      overnight: overnightReadings(
        nights,
        oxygen.map((r) => ({ time: r.time, value: r.percentage })),
        breathing.map((r) => ({ time: r.time, value: r.rate })),
      ),
    });
  } catch (e) {
    throw new HealthError('Could not read from Health Connect. Try again.', { cause: e });
  }
}
