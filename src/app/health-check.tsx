import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import type { ReadRecordsOptions, RecordType } from 'react-native-health-connect';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card } from '../components/ui';
import { describeOverview, describeSession, describeSleep, overviewOf, SessionData, summariseSession } from '../healthprobe';
import { READ_TYPES } from '../healthconnect';
import { colors, spacing, type } from '../theme';

const DAY_MS = 86400000;
// Without the history permission an app can only read 30 days back, so stay just inside that.
const DEFAULT_DAYS = 29;
const HISTORY_DAYS = 120;
const SESSIONS_TO_INSPECT = 12;
const MAX_PAGES = 8;

type TimeRangeFilter = ReadRecordsOptions['timeRangeFilter'];

/** Whether Health Connect says this permission was granted. The library returns the history permission too but does not type it. */
const hasPermission = (granted: { recordType: string }[], recordType: string) => granted.some((p) => p.recordType === recordType);

/** Every record of one type in a time range, following the pages, or an error message instead of throwing. */
async function readAll(recordType: RecordType, timeRangeFilter: TimeRangeFilter): Promise<{ records: any[]; error?: string }> {
  const records: any[] = [];
  try {
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result: { records: any[]; pageToken?: string } = await readRecords(recordType, { timeRangeFilter, pageSize: 500, pageToken });
      records.push(...result.records);
      pageToken = result.pageToken || undefined;
      if (!pageToken) break;
    }
    return { records };
  } catch (e) {
    return { records, error: e instanceof Error ? e.message : String(e) };
  }
}

const between = (startTime: string, endTime: string): TimeRangeFilter => ({ operator: 'between', startTime, endTime });

/** A temporary screen for finding out what the watch really writes to Health Connect. */
export default function HealthCheckScreen() {
  const [report, setReport] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    setMessage('');
    try {
      const status = await getSdkStatus();
      if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        setMessage(
          status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
            ? 'Health Connect needs updating. Update it in the Play Store, then try again.'
            : 'Health Connect is not available on this phone.',
        );
        return;
      }
      if (!(await initialize())) {
        setMessage('Health Connect could not start.');
        return;
      }
      await requestPermission([
        ...READ_TYPES.map((t) => ({ accessType: 'read' as const, recordType: t.recordType })),
        { accessType: 'read' as const, recordType: 'ReadHealthDataHistory' as const },
      ]);
      const granted = await getGrantedPermissions();
      const history = hasPermission(granted, 'ReadHealthDataHistory');
      const names = READ_TYPES.filter((t) => hasPermission(granted, t.recordType)).length;
      setMessage(`Allowed ${names} of ${READ_TYPES.length} kinds of data. Reading older than 30 days: ${history ? 'allowed' : 'not allowed'}.`);
    } catch (e) {
      setMessage(`Could not ask for access: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const read = async () => {
    setBusy(true);
    setMessage('Reading…');
    try {
      await initialize();
      const granted = await getGrantedPermissions();
      const history = hasPermission(granted, 'ReadHealthDataHistory');
      const days = history ? HISTORY_DAYS : DEFAULT_DAYS;
      const end = new Date();
      const start = new Date(end.getTime() - days * DAY_MS);
      const window = between(start.toISOString(), end.toISOString());
      const lines: string[] = [`Health Connect report, ${end.toLocaleString('en-NZ')}`, `Looking back ${days} days${history ? ' (older than 30 days allowed)' : ''}.`, ''];

      // Workouts, newest first.
      const exercise = await readAll('ExerciseSession', window);
      lines.push(`WORKOUTS: ${exercise.records.length} in ${days} days${exercise.error ? ` (error: ${exercise.error})` : ''}`);
      const counts = new Map<string, number>();
      for (const r of exercise.records) counts.set(String(r.exerciseType), (counts.get(String(r.exerciseType)) ?? 0) + 1);
      lines.push(`  by exercise type number: ${[...counts.entries()].map(([t, n]) => `${t}×${n}`).join(', ') || 'none'}`);
      lines.push('');

      const latest = [...exercise.records].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, SESSIONS_TO_INSPECT);
      const failures = new Set<string>();
      for (const session of latest) {
        const range = between(session.startTime, session.endTime);
        const [distances, heartRates, speeds, elevations, calories] = await Promise.all([
          readAll('Distance', range),
          readAll('HeartRate', range),
          readAll('Speed', range),
          readAll('ElevationGained', range),
          readAll('TotalCaloriesBurned', range),
        ]);
        for (const [name, r] of [['Distance', distances], ['HeartRate', heartRates], ['Speed', speeds], ['ElevationGained', elevations], ['TotalCaloriesBurned', calories]] as const) {
          if (r.error) failures.add(`${name}: ${r.error}`);
        }
        const data: SessionData = {
          session,
          distances: distances.records,
          heartRates: heartRates.records,
          speeds: speeds.records,
          elevations: elevations.records,
          calories: calories.records,
        };
        lines.push(...describeSession(summariseSession(data)), '');
      }
      if (failures.size) lines.push('READ ERRORS:', ...[...failures].map((f) => `  ${f}`), '');

      // Health and sleep.
      lines.push('HEALTH DATA');
      for (const [label, recordType] of [
        ['Sleep', 'SleepSession'],
        ['Resting heart rate', 'RestingHeartRate'],
        ['Heart rate variability', 'HeartRateVariabilityRmssd'],
        ['Oxygen saturation', 'OxygenSaturation'],
        ['VO2 max', 'Vo2Max'],
        ['Respiratory rate', 'RespiratoryRate'],
        ['Skin temperature', 'SkinTemperature'],
      ] as const) {
        const r = await readAll(recordType, window);
        lines.push(`  ${describeOverview(overviewOf(label, r.records))}${r.error ? ` (error: ${r.error})` : ''}`);
      }
      const sleep = await readAll('SleepSession', between(new Date(end.getTime() - 8 * DAY_MS).toISOString(), end.toISOString()));
      lines.push('', 'LAST NIGHTS OF SLEEP');
      const nights = [...sleep.records].sort((a, b) => b.endTime.localeCompare(a.endTime)).slice(0, 7);
      lines.push(...(nights.length ? nights.map((n) => `  ${describeSleep(n)}`) : ['  none']));

      setReport(lines);
      setMessage(`Done. ${latest.length} workouts inspected.`);
    } catch (e) {
      setMessage(`Could not read: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={32} color={colors.accent} />
        </Pressable>
        <Text style={type.title}>Health Connect check</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <Card>
          <Text style={type.body}>
            This shows what your watch writes into Health Connect, so we can decide how the app should use it. Nothing leaves your phone unless you press Share.
          </Text>
          <Button label="1. Allow access" onPress={allow} disabled={busy} />
          <Button label="2. Read my data" onPress={read} disabled={busy} />
          <Button label="Open Health Connect settings" variant="quiet" onPress={openHealthConnectSettings} />
          {message !== '' && <Text style={type.small}>{message}</Text>}
        </Card>

        {report.length > 0 && (
          <Card title="What it found">
            <Text selectable style={styles.report}>
              {report.join('\n')}
            </Text>
            <Button label="Share report" variant="quiet" onPress={() => Share.share({ message: report.join('\n') })} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  report: { fontFamily: 'monospace', fontSize: 12, lineHeight: 17, color: colors.ink },
});
