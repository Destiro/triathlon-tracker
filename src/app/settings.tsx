import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomInset } from '../components/layout';
import { Button, Card } from '../components/ui';
import { PlaceField } from '../components/WeatherCards';
import { fromKey, isDateKey } from '../dates';
import { openSettings as openHealthConnect } from '../health/connect';
import { formatAgo } from '../format';
import { healthCoverage } from '../statsExtra';
import { Settings, useStore } from '../store';
import { colors, radius, spacing, type } from '../theme';

function Field({ label, value, onCommit, hint, keyboard }: { label: string; value: string; onCommit: (v: string) => string | null; hint?: string; keyboard?: 'numeric' | 'default' }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    const problem = onCommit(text.trim());
    setError(problem);
    if (problem) setText(value);
  };
  // Save as soon as what's typed is valid, so switching tabs without leaving the field doesn't lose it.
  const change = (v: string) => {
    setText(v);
    if (onCommit(v.trim()) === null) setError(null);
  };
  return (
    <View style={{ gap: 4 }}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={change}
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
  const bottom = useBottomInset();
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
    weather,
    weatherUpdating,
    weatherError,
    setPlace,
    clearPlace,
    refreshWeather,
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
  const limit = (key: 'rainLimit' | 'windLimit' | 'waveLimit' | 'wetsuitBelow', min: number, max: number, unit: string) => (v: string) => {
    const n = Number(v);
    if (v === '' || !Number.isFinite(n) || n < min || n > max) return `Enter a number from ${min} to ${max} ${unit}.`;
    updateSettings({ [key]: n });
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
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: spacing.lg + bottom }]} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: spacing.xs }}>
              <MaterialCommunityIcons name="arrow-left" size={26} color={colors.ink} />
            </Pressable>
            <Text style={type.title}>Settings</Text>
          </View>

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
                <View style={{ gap: 2 }}>
                  <Text style={type.label}>Coming through so far</Text>
                  {healthCoverage(health, activities).map((c) => (
                    <Text key={c.label} style={type.small}>
                      {c.label}: {c.count ? `${c.count} ${c.unit}` : 'none yet'}
                    </Text>
                  ))}
                </View>
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
          </Card>

          <Card>
            <Text style={type.heading}>Weather</Text>
            <Text style={type.small}>
              The forecast for the next 16 days, to decide between outside and indoors. It comes from Open-Meteo, which is free. Only the place you set
              here is sent to it.
            </Text>
            <PlaceField
              label="Your town"
              place={settings.homePlace}
              hint="Not set. Weather shows on the Plan calendar once it is."
              onFind={(name) => setPlace('home', name)}
              onClear={() => clearPlace('home')}
            />
            <PlaceField
              label="Ocean swim beach"
              place={settings.beachPlace}
              hint="Not set. Adds sea temperature and waves on days with a swim."
              onFind={(name) => setPlace('beach', name)}
              onClear={() => clearPlace('beach')}
            />
            {(settings.homePlace || settings.beachPlace) && (
              <>
                <Text style={[type.small, weatherError ? styles.error : null]}>
                  {weatherError ?? (weatherUpdating ? 'Updating…' : weather ? `Forecast updated ${formatAgo(weather.fetchedAt)}` : 'Not fetched yet')}
                </Text>
                <Button label={weatherUpdating ? 'Updating…' : 'Update forecast'} variant="quiet" onPress={refreshWeather} disabled={weatherUpdating} />
              </>
            )}
            <Field label="Think indoor when rain is likelier than (%)" value={String(settings.rainLimit)} keyboard="numeric" onCommit={limit('rainLimit', 0, 100, '%')} />
            <Field label="Think indoor when wind is above (km/h)" value={String(settings.windLimit)} keyboard="numeric" onCommit={limit('windLimit', 5, 100, 'km/h')} />
            <Field label="Think pool when waves are above (m)" value={String(settings.waveLimit)} keyboard="numeric" onCommit={limit('waveLimit', 0.2, 5, 'm')} />
            <Field label="Wetsuit when the sea is under (°)" value={String(settings.wetsuitBelow)} keyboard="numeric" onCommit={limit('wetsuitBelow', 8, 30, '°')} />
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
  error: { color: colors.danger, fontSize: 13 },
});
