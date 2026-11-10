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
    connected,
    athlete,
    lastSync,
    syncing,
    syncError,
    connectStrava,
    disconnectStrava,
    sync,
    health,
    healthConnected,
    lastHealthSync,
    healthSyncing,
    healthError,
    connectHealth,
    disconnectHealth,
  } = useStore();
  const healthDays = Object.keys(health).length;

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

  const confirmDisconnect = () =>
    Alert.alert('Disconnect Strava?', 'Your synced workouts are removed from this phone. Strava itself is not changed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: disconnectStrava },
    ]);

  const confirmHealthDisconnect = () =>
    Alert.alert(
      'Stop reading Health Connect?',
      'Your sleep and heart rate history is removed from this app. To take back access as well, turn it off in Health Connect.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop reading', style: 'destructive', onPress: disconnectHealth },
      ],
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <Text style={type.title}>Settings</Text>

          <Card>
            <Text style={type.heading}>Strava</Text>
            {connected ? (
              <>
                <Text style={type.body}>Connected{athlete ? ` as ${athlete}` : ''}.</Text>
                <Text style={[type.small, syncError ? styles.error : null]}>
                  {syncError ?? (syncing ? 'Syncing…' : lastSync ? `Last synced ${formatAgo(lastSync)}` : 'Not synced yet')}
                </Text>
                <Button label={syncing ? 'Syncing…' : 'Sync now'} onPress={sync} disabled={syncing} />
                <Button label="Disconnect" variant="quiet" onPress={confirmDisconnect} />
              </>
            ) : (
              <>
                <Text style={type.body}>Your Galaxy Watch uploads to Strava through Samsung Health. Connect it to pull your workouts in.</Text>
                <Button label="Connect Strava" onPress={connectStrava} />
                {syncError && <Text style={styles.error}>{syncError}</Text>}
              </>
            )}
          </Card>

          <Card>
            <Text style={type.heading}>Health Connect</Text>
            {healthConnected ? (
              <>
                <Text style={type.body}>Reading sleep, VO2 max and heart rate{healthDays ? ` · ${healthDays} days so far` : ''}.</Text>
                <Text style={[type.small, healthError ? styles.error : null]}>
                  {healthError ?? (healthSyncing ? 'Reading…' : lastHealthSync ? `Last read ${formatAgo(lastHealthSync)}` : 'Not read yet')}
                </Text>
                <Button label="Choose what the app can read" variant="quiet" onPress={openHealthConnect} />
                <Button label="Stop reading" variant="quiet" onPress={confirmHealthDisconnect} />
              </>
            ) : (
              <>
                <Text style={type.body}>
                  Samsung Health shares your sleep, VO2 max and heart rate with Health Connect. Connect it to see sleep stages, recovery and VO2 max
                  trends alongside your training.
                </Text>
                <Button label="Connect Health Connect" onPress={connectHealth} />
                {healthError && <Text style={styles.error}>{healthError}</Text>}
              </>
            )}
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
