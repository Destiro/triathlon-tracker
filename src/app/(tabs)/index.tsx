import { router } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ring } from '../../components/charts';
import { DayWorkouts } from '../../components/DayWorkouts';
import { colorOf, SPORT_LABELS, tintOf } from '../../components/sport';
import { Button, Card, Empty } from '../../components/ui';
import { WeekStrip } from '../../components/WeekStrip';
import { plannedAmount } from '../../components/WorkoutCard';
import { daysBetween, formatDay, fromKey } from '../../dates';
import { formatAgo, formatMinutes } from '../../format';
import { daysOfWeek, PHASE_LABELS, TOTAL_WEEKS } from '../../plan/schedule';
import { SPORTS, unitOf, upNext, weekCompliance, weekGym, weekVolume } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, radius, spacing, type } from '../../theme';

export default function TodayScreen() {
  const { settings, schedule, activitiesByDate, connected, syncing, sync, lastSync, syncError, connectStrava } = useStore();
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
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
      >
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

        <Text style={type.title}>{formatDay(fromKey(todayKey))}</Text>

        {!connected ? (
          <Card>
            <Text style={type.heading}>Connect Strava</Text>
            <Text style={type.body}>
              Your watch already syncs to Strava. Connect it and your workouts tick themselves off here, with no start or stop buttons.
            </Text>
            <Button label="Connect Strava" onPress={connectStrava} />
            {syncError && <Text style={styles.error}>{syncError}</Text>}
          </Card>
        ) : (
          <Text style={[type.small, syncError ? styles.error : null]}>
            {syncError ?? (syncing ? 'Syncing with Strava…' : lastSync ? `Synced ${formatAgo(lastSync)} · pull down to refresh` : 'Not synced yet')}
          </Text>
        )}

        {today ? (
          <DayWorkouts date={todayKey} />
        ) : (
          <Empty text={todayKey < settings.planStart ? `The plan starts on ${formatDay(fromKey(settings.planStart))}.` : 'The plan has finished.'} />
        )}

        {/* Only when nothing is left today: a rest day, or everything is done. */}
        {next && next.date !== todayKey && (
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

        {today && (
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
        <View style={{ height: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  error: { color: colors.danger },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  phase: { fontSize: 13, fontWeight: '600', color: colors.accent, flexShrink: 1 },
  countdown: { ...type.number, fontSize: 15 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
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
