import { router } from 'expo-router';
import React, { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ring } from '../../components/charts';
import { DayWorkouts } from '../../components/DayWorkouts';
import { colorOf, SPORT_LABELS, tintOf } from '../../components/sport';
import { FixedBody } from '../../components/layout';
import { Button, Card, Empty, Segments } from '../../components/ui';
import { WeekStrip } from '../../components/WeekStrip';
import { plannedAmount } from '../../components/WorkoutCard';
import { daysBetween, formatDay, fromKey } from '../../dates';
import { formatAgo, formatMinutes } from '../../format';
import { daysOfWeek, PHASE_LABELS, TOTAL_WEEKS } from '../../plan/schedule';
import { SPORTS, unitOf, upNext, weekCompliance, weekGym, weekVolume } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, radius, spacing, type } from '../../theme';

type Page = 'today' | 'week';
const PAGES: { value: Page; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
];

export default function TodayScreen() {
  const [page, setPage] = useState<Page>('today');
  const { settings, schedule, activitiesByDate, healthConnected, syncing, sync, lastSync, syncError, connectHealth, healthSyncing } = useStore();
  const todayKey = useTodayKey();
  const today = schedule.get(todayKey);
  const daysToRace = daysBetween(fromKey(todayKey), fromKey(settings.raceDate));
  const next = upNext(schedule, activitiesByDate, todayKey);

  const week = today?.week ?? (todayKey < settings.planStart ? 1 : TOTAL_WEEKS);
  const compliance = weekCompliance(schedule, activitiesByDate, week, todayKey);
  const volume = weekVolume(schedule, activitiesByDate, week);
  const gym = weekGym(schedule, activitiesByDate, week);
  const doneCount = Math.round(compliance.score);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <Text style={styles.phase}>
            {today ? `Week ${week} of ${TOTAL_WEEKS} · ${PHASE_LABELS[today.phase]}${today.recovery ? ' · recovery' : ''}` : ''}
          </Text>
          <Text style={type.small}>
            {daysToRace > 0 ? (
              <>
                <Text style={styles.countdown}>{daysToRace}</Text> days to go
              </>
            ) : daysToRace === 0 ? (
              'Race day!'
            ) : (
              'Race done'
            )}
          </Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={[type.title, { flex: 1 }]}>{formatDay(fromKey(todayKey))}</Text>
          <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings" style={styles.gear}>
            <MaterialCommunityIcons name="cog-outline" size={26} color={colors.inkSoft} />
          </Pressable>
        </View>

        {healthConnected && (
          <View style={styles.titleRow}>
            <Text style={[type.small, { flex: 1 }, syncError ? styles.error : null]}>
              {syncError ?? (syncing ? 'Reading Health Connect…' : lastSync ? `Synced ${formatAgo(lastSync)}` : 'Not synced yet')}
            </Text>
            <Pressable onPress={sync} disabled={syncing || healthSyncing} hitSlop={10} accessibilityRole="button" accessibilityLabel="Read Health Connect now">
              <Text style={[styles.link, (syncing || healthSyncing) && { opacity: 0.5 }]}>Refresh</Text>
            </Pressable>
          </View>
        )}

        <Segments options={PAGES} value={page} onChange={setPage} />
      </View>

      <FixedBody>
        {page === 'today' && !healthConnected && (
          <Card>
            <Text style={type.heading}>Connect Health Connect</Text>
            <Text style={type.body}>
              Your watch already shares workouts with Health Connect through Samsung Health. Connect it and your workouts tick themselves off here,
              with no start or stop buttons.
            </Text>
            <Button label="Connect Health Connect" onPress={connectHealth} />
            {syncError && <Text style={styles.error}>{syncError}</Text>}
          </Card>
        )}

        {page === 'today' && (today ? (
          <DayWorkouts date={todayKey} />
        ) : (
          <Empty text={todayKey < settings.planStart ? `The plan starts on ${formatDay(fromKey(settings.planStart))}.` : 'The plan has finished.'} />
        ))}

        {/* Only when nothing is left today: a rest day, or everything is done. */}
        {page === 'today' && next && next.date !== todayKey && (
          <Pressable
            onPress={() => router.push({ pathname: '/day/[date]', params: { date: next.date } })}
            style={[styles.next, { borderLeftColor: colorOf(next.result.workout.kind) }]}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Next · {fromKey(next.date).toLocaleDateString(undefined, { weekday: 'long' })}</Text>
              <Text style={type.heading}>{next.result.workout.title}</Text>
              <Text style={type.small}>
                {SPORT_LABELS[next.result.workout.kind]}
                {plannedAmount(next.result.workout) ? ` · ${plannedAmount(next.result.workout)}` : ''}
              </Text>
            </View>
          </Pressable>
        )}

        {page === 'week' && today && (
          <Card>
            <View style={styles.between}>
              <Text style={type.heading}>This week</Text>
              <Text style={type.small}>{compliance.due ? `${doneCount} of ${compliance.due} done` : 'Nothing due yet'}</Text>
            </View>
            <View style={styles.rings}>
              {SPORTS.map((s) => {
                const v = volume[s];
                const amount =
                  unitOf(s) === 'metres'
                    ? `${(v.actual / 1000).toFixed(1)} / ${(v.planned / 1000).toFixed(1)} km`
                    : `${formatMinutes(v.actual)} / ${formatMinutes(v.planned)}`;
                return (
                  <View key={s} style={styles.ring} accessibilityLabel={`${SPORT_LABELS[s]}: ${amount}`}>
                    <Ring value={v.planned ? v.actual / v.planned : 0} color={colorOf(s)} tint={tintOf(s)} />
                    <Text style={styles.ringLabel}>{SPORT_LABELS[s]}</Text>
                    <Text style={styles.ringAmount}>{amount}</Text>
                  </View>
                );
              })}
            </View>
            {(gym.planned > 0 || gym.actual > 0) && (
              <Text style={type.small}>
                Gym {formatMinutes(gym.actual)}
                {gym.planned > 0 ? ` of ${formatMinutes(gym.planned)}` : ''}
              </Text>
            )}
            <WeekStrip days={daysOfWeek(schedule, week)} schedule={schedule} activitiesByDate={activitiesByDate} todayKey={todayKey} />
          </Card>
        )}
      </FixedBody>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  link: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  error: { color: colors.danger },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  phase: { fontSize: 13, fontWeight: '600', color: colors.accent, flexShrink: 1 },
  countdown: { ...type.number, fontSize: 15 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  gear: { padding: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 5,
    padding: spacing.md,
  },
  rings: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.xs },
  ring: { alignItems: 'center', gap: 2, flex: 1 },
  ringLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  ringAmount: { fontSize: 11, color: colors.inkSoft, fontFamily: 'monospace' },
});
