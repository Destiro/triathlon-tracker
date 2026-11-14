import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card } from '../../components/ui';
import { fromKey, isDateKey } from '../../dates';
import { openSettings as openHealthConnect } from '../../health/connect';
import { formatAgo } from '../../format';
import { Settings, useStore } from '../../store';
import { colors, radius, spacing, type } from '../../theme';

function Field({ label, value, onCommit, hint, keyboard }: { label: string; value: string; onCommit: (v: string) => string | null; hint?: string; keyboard?: 'numeric' | 'default' }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    const problem = onCommit(text.trim());
    setError(problem);
    if (problem) setText(value);
  };
  return (
    <View style={{ gap: 4 }}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType={keyboard}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const {
    settings,
    updateSettings,
    activities,
    lastSync,
    syncing,
    syncError,
    pastDataAllowed,
    sync,
    health,
    healthConnected,
    lastHealthSync,
    healthSyncing,
    healthError,
    connectHealth,
    disconnectHealth,
    lastBackup,
    exportBackup,
    restoreBackup,
  } = useStore();
  const healthDays = Object.keys(health).length;
  const [backupMessage, setBackupMessage] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const busy = syncing || healthSyncing;

  const runBackup = (action: () => Promise<string>) => async () => {
    setBackingUp(true);
    setBackupMessage(await action());
    setBackingUp(false);
  };

  const date = (key: keyof Pick<Settings, 'planStart' | 'raceDate'>, mondayOnly = false) => (v: string) => {
    if (!isDateKey(v)) return 'Use the format YYYY-MM-DD.';
    if (mondayOnly && fromKey(v).getDay() !== 1) return 'Week 1 starts on a Monday.';
    updateSettings({ [key]: v });
    return null;
  };
  const heartRate = (key: 'maxHr' | 'restHr', min: number, max: number) => (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return `Enter a number from ${min} to ${max}.`;
    updateSettings({ [key]: n });
    return null;
  };

  const confirmHealthDisconnect = () =>
    Alert.alert(
      'Stop reading Health Connect?',
      'New workouts and sleep stop coming in. Everything already in the app stays. To take back access as well, turn it off in Health Connect.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop reading', style: 'destructive', onPress: disconnectHealth },
      ],
    );

  const confirmRestore = () =>
    Alert.alert(
      'Restore a backup?',
      'Workouts and health days in the backup that this phone is missing are added back, and nothing here is removed. Your plan changes and settings are replaced with the ones in the backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose file', onPress: runBackup(restoreBackup) },
      ],
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <Text style={type.title}>Settings</Text>

          <Card>
            <Text style={type.heading}>Health Connect</Text>
            {healthConnected ? (
              <>
                <Text style={type.body}>
                  Reading workouts, sleep, VO2 max and heart rate · {activities.length} workouts
                  {healthDays ? ` and ${healthDays} days of health` : ''} saved.
                </Text>
                <Text style={[type.small, syncError ? styles.error : null]}>
                  Workouts: {syncError ?? (syncing ? 'reading…' : lastSync ? `last read ${formatAgo(lastSync)}` : 'not read yet')}
                </Text>
                <Text style={[type.small, healthError ? styles.error : null]}>
                  Sleep and recovery: {healthError ?? (healthSyncing ? 'reading…' : lastHealthSync ? `last read ${formatAgo(lastHealthSync)}` : 'not read yet')}
                </Text>
                {pastDataAllowed === false && (
                  <Text style={type.small}>
                    Only the last 30 days can be read. To bring in older workouts, allow past data: Choose what the app can read → Triathlon Tracker.
                  </Text>
                )}
                <Button label={busy ? 'Reading…' : 'Read now'} onPress={sync} disabled={busy} />
                <Button label="Ask for access again" variant="quiet" onPress={connectHealth} />
                <Button label="Choose what the app can read" variant="quiet" onPress={openHealthConnect} />
                <Button label="Stop reading" variant="quiet" onPress={confirmHealthDisconnect} />
              </>
            ) : (
              <>
                <Text style={type.body}>
                  Your Galaxy Watch records workouts, sleep and heart rate through Samsung Health, which shares them with Health Connect. Connect it
                  and your workouts tick themselves off here, alongside sleep, recovery and VO2 max.
                </Text>
                <Button label="Connect Health Connect" onPress={connectHealth} />
                {(healthError || syncError) && <Text style={styles.error}>{healthError ?? syncError}</Text>}
              </>
            )}
            <Text style={type.small}>See exactly what your watch writes to Health Connect for each workout.</Text>
            <Button label="Workout check" variant="quiet" onPress={() => router.push('/workout-check')} />
          </Card>

          <Card>
            <Text style={type.heading}>Backup</Text>
            <Text style={type.body}>
              Your training history is kept only on this phone, including the workouts saved from Strava. Save a backup somewhere else, like Google
              Drive, so a lost or reset phone doesn&apos;t lose it.
            </Text>
            <Text style={type.small}>{lastBackup ? `Last backup ${formatAgo(lastBackup)}` : 'No backup made yet'}</Text>
            <Button label={backingUp ? 'Working…' : 'Back up now'} onPress={runBackup(exportBackup)} disabled={backingUp} />
            <Button label="Restore from a backup" variant="quiet" onPress={confirmRestore} disabled={backingUp} />
            {backupMessage !== '' && <Text style={type.small}>{backupMessage}</Text>}
          </Card>

          <Card>
            <Text style={type.heading}>Race and plan</Text>
            <Field label="Race name" value={settings.raceName} onCommit={(v) => (v ? (updateSettings({ raceName: v }), null) : 'Give the race a name.')} />
            <Field label="Race date" value={settings.raceDate} onCommit={date('raceDate')} hint="YYYY-MM-DD. Race week is counted back from this day." />
            <Field label="Week 1 starts (a Monday)" value={settings.planStart} onCommit={date('planStart', true)} hint="YYYY-MM-DD. Move this if you start the plan late." />
          </Card>

          <Card>
            <Text style={type.heading}>Heart rate</Text>
            <Text style={type.small}>Used to turn the average heart rate of each workout into training load.</Text>
            <Field label="Max heart rate (bpm)" value={String(settings.maxHr)} keyboard="numeric" onCommit={heartRate('maxHr', 120, 230)} hint="Your highest recorded heart rate also counts if it is higher." />
            <Field label="Resting heart rate (bpm)" value={String(settings.restHr)} keyboard="numeric" onCommit={heartRate('restHr', 30, 100)} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
  error: { color: colors.danger, fontSize: 13 },
});
