/**
 * What the app asks Health Connect for. Each record type needs its Android permission declared in app.json as well,
 * or the request fails without a clear error; a test checks the two lists agree.
 */
export const READ_TYPES = [
  { recordType: 'ExerciseSession', permission: 'android.permission.health.READ_EXERCISE' },
  { recordType: 'Distance', permission: 'android.permission.health.READ_DISTANCE' },
  { recordType: 'Speed', permission: 'android.permission.health.READ_SPEED' },
  { recordType: 'HeartRate', permission: 'android.permission.health.READ_HEART_RATE' },
  { recordType: 'ElevationGained', permission: 'android.permission.health.READ_ELEVATION_GAINED' },
  { recordType: 'TotalCaloriesBurned', permission: 'android.permission.health.READ_TOTAL_CALORIES_BURNED' },
  { recordType: 'ActiveCaloriesBurned', permission: 'android.permission.health.READ_ACTIVE_CALORIES_BURNED' },
  { recordType: 'Power', permission: 'android.permission.health.READ_POWER' },
  { recordType: 'Vo2Max', permission: 'android.permission.health.READ_VO2_MAX' },
  { recordType: 'SleepSession', permission: 'android.permission.health.READ_SLEEP' },
  { recordType: 'RestingHeartRate', permission: 'android.permission.health.READ_RESTING_HEART_RATE' },
  { recordType: 'HeartRateVariabilityRmssd', permission: 'android.permission.health.READ_HEART_RATE_VARIABILITY' },
  { recordType: 'OxygenSaturation', permission: 'android.permission.health.READ_OXYGEN_SATURATION' },
  { recordType: 'RespiratoryRate', permission: 'android.permission.health.READ_RESPIRATORY_RATE' },
  { recordType: 'SkinTemperature', permission: 'android.permission.health.READ_SKIN_TEMPERATURE' },
] as const;

export type ReadRecordType = (typeof READ_TYPES)[number]['recordType'];

/**
 * By default an app can only read the 30 days before it was first given access. This lifts that, so an older plan
 * start can still be read, on phones that offer it.
 */
export const HISTORY_PERMISSION = 'android.permission.health.READ_HEALTH_DATA_HISTORY';

/** Every Android permission the manifest has to declare. */
export const MANIFEST_PERMISSIONS: string[] = [...READ_TYPES.map((t) => t.permission), HISTORY_PERMISSION];
