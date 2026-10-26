import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RaceCard } from '../components/races';
import { Button, Card, ProgressBar, SectionTitle, SportBadge, Stat } from '../components/ui';
import { WorkoutDetail, WorkoutRow } from '../components/workouts';
import { formatHours } from '../lib/format';
import { describeForm, loadSeries } from '../lib/load';
import { DATA_VERSION } from '../lib/migrate';
import { sessionsOn, sessionStatus } from '../lib/plan';
import { nextRace } from '../lib/races';
import { withSamples } from '../lib/sample';
import { currentStreak, VOLUME_SPORTS, weeklyVolume } from '../lib/stats';
import { byNewest } from '../lib/workout';
import { TabParams } from '../navigation';
import { useStore } from '../store';
import { colors, radius, spacing, sportColors, type } from '../theme';
import { activityFor } from './PlanScreen';
import { SettingsModal } from './SettingsModal';

const greeting = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');

export default function TodayScreen() {
  const store = useStore();
  const { workouts, races, plan, settings } = store;
  const navigation = useNavigation<NavigationProp<TabParams>>();
  const [today] = useState(() => new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const week = useMemo(() => weeklyVolume(workouts, today, 1)[0], [workouts, today]);
  const load = useMemo(() => loadSeries(workouts, settings, today, 1)[0], [workouts, settings, today]);
  const streak = useMemo(() => currentStreak(workouts, today), [workouts, today]);
  const race = nextRace(races, today);
  const todays = sessionsOn(plan, today);
  const recentWorkouts = useMemo(() => [...workouts].sort(byNewest).slice(0, 3), [workouts]);
  const open = workouts.find((w) => w.id === openId) ?? null;
  const target = settings.weeklyTargetMin * 60;
  const form = describeForm(load?.form ?? 0);
  const isNew = workouts.length === 0 && races.length === 0;

  const track = (activity: string) => navigation.navigate('Track', { activity, at: Date.now() });
  const trySample = () => {
    const { workouts: w, races: r, plan: p, gear } = store;
    store.replaceAll(withSamples({ version: DATA_VERSION, workouts: w, races: r, plan: p, gear, settings }, new Date()));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={type.small}>{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            <Text style={type.title}>
              {greeting(today)}
              {settings.name ? `, ${settings.name}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings" style={styles.settings}>
            <MaterialCommunityIcons name="cog-outline" size={26} color={colors.ink} />
          </Pressable>
        </View>

        {isNew ? (
          <Card style={styles.welcome}>
            <Text style={[type.heading, { color: colors.white }]}>Welcome to Triathlon Tracker</Text>
            <Text style={[type.body, { color: colors.white }]}>Swim, bike and run, all in one place. Three ways to get going:</Text>
            <Button label="Record a workout" icon="record-circle-outline" variant="quiet" onPress={() => track('run')} />
            <Button label="Add your race" icon="flag-checkered" variant="quiet" onPress={() => navigation.navigate('Plan')} />
            <Button label="Explore with sample data" icon="flask-outline" variant="quiet" onPress={trySample} />
          </Card>
        ) : null}

        {race ? <RaceCard race={race} onPress={() => navigation.navigate('Plan')} /> : null}

        {todays.length > 0 ? (
          <>
            <SectionTitle>Today&apos;s plan</SectionTitle>
            {todays.map((s) => {
              const status = sessionStatus(s, workouts, today);
              return (
                <Card key={s.id}>
                  <View style={styles.sessionRow}>
                    <SportBadge sport={s.sport} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.heading}>{s.title}</Text>
                      <Text style={type.small}>{s.durationMin > 0 ? formatHours(s.durationMin * 60) : s.sport === 'rest' ? 'Rest day' : 'Race day'}</Text>
                    </View>
                    {status === 'done' ? <MaterialCommunityIcons name="check-circle" size={28} color={colors.success} /> : null}
                  </View>
                  <Text style={type.small} numberOfLines={3}>
                    {s.description}
                  </Text>
                  {s.sport !== 'rest' && status !== 'done' ? <Button label="Start" icon="play" onPress={() => track(activityFor(s))} /> : null}
                </Card>
              );
            })}
          </>
        ) : null}

        <SectionTitle>This week</SectionTitle>
        <Card>
          <View style={styles.weekTop}>
            <Text style={type.number}>{formatHours(week.totalSec)}</Text>
            <Text style={type.small}>of {formatHours(target)} target</Text>
          </View>
          <ProgressBar value={week.totalSec / Math.max(1, target)} color={week.totalSec >= target ? colors.success : colors.accent} height={10} />
          <View style={styles.sports}>
            {VOLUME_SPORTS.map((s) => (
              <View key={s} style={styles.sportTile}>
                <View style={[styles.sportDot, { backgroundColor: sportColors[s] }]} />
                <Text style={type.small}>{s[0].toUpperCase() + s.slice(1)}</Text>
                <Text style={[type.body, { fontWeight: '700' }]}>{formatHours(week.seconds[s])}</Text>
              </View>
            ))}
          </View>
          <View style={styles.row}>
            <Stat label="Sessions" value={String(week.sessions)} />
            <Stat label="Streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} />
          </View>
        </Card>

        {workouts.length > 0 && load ? (
          <Card onPress={() => navigation.navigate('Stats')}>
            <View style={styles.formTop}>
              <Text style={type.label}>Form</Text>
              <Text style={[type.heading, { color: load.form < -30 ? colors.danger : load.form > 5 ? colors.success : colors.ink }]}>{form.label}</Text>
            </View>
            <Text style={type.small}>{form.advice}</Text>
            <View style={styles.row}>
              <Stat label="Fitness" value={String(Math.round(load.fitness))} />
              <Stat label="Fatigue" value={String(Math.round(load.fatigue))} />
              <Stat label="Form" value={`${load.form > 0 ? '+' : ''}${Math.round(load.form)}`} />
            </View>
          </Card>
        ) : null}

        <SectionTitle>Start a workout</SectionTitle>
        <View style={styles.quick}>
          {[
            { id: 'run', label: 'Run', sport: 'run' as const },
            { id: 'bike', label: 'Ride', sport: 'bike' as const },
            { id: 'swim', label: 'Swim', sport: 'swim' as const },
            { id: 'brick', label: 'Brick', sport: 'brick' as const },
          ].map((q) => (
            <Pressable key={q.id} onPress={() => track(q.id)} style={({ pressed }) => [styles.quickButton, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`Start a ${q.label.toLowerCase()}`}>
              <SportBadge sport={q.sport} size={40} />
              <Text style={[type.small, { color: colors.ink, fontWeight: '600' }]}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        {recentWorkouts.length > 0 ? (
          <>
            <SectionTitle
              action={
                <Pressable onPress={() => navigation.navigate('Log')} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>See all</Text>
                </Pressable>
              }
            >
              Recent
            </SectionTitle>
            {recentWorkouts.map((w) => (
              <WorkoutRow key={w.id} workout={w} onPress={() => setOpenId(w.id)} />
            ))}
          </>
        ) : null}
      </ScrollView>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {open && <WorkoutDetail workout={open} onClose={() => setOpenId(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  settings: { padding: spacing.xs },
  welcome: { backgroundColor: colors.accent, borderColor: colors.accent, gap: spacing.md },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weekTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  sports: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.xs },
  sportTile: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: colors.bg, borderRadius: radius.sm, paddingVertical: spacing.sm },
  sportDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', gap: spacing.md },
  formTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quick: { flexDirection: 'row', gap: spacing.sm },
  quickButton: { flex: 1, alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.line },
  link: { color: colors.accent, fontWeight: '700' },
});
