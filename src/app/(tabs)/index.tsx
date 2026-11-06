import { router } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ring } from '../../components/charts';
import { colorOf, SPORT_LABELS, tintOf } from '../../components/sport';
import { Button, Card, Empty } from '../../components/ui';
import { WeekStrip } from '../../components/WeekStrip';
import { plannedAmount, WorkoutCard } from '../../components/WorkoutCard';
import { addDays, daysBetween, formatDay, fromKey, toKey } from '../../dates';
import { formatAgo, formatMinutes } from '../../format';
import { daysOfWeek, PHASE_LABELS, TOTAL_WEEKS } from '../../plan/schedule';
import { stepBlocks } from '../../plan/steps';
import { dayResult, SPORTS, unitOf, UpNext, upNext, weekCompliance, weekVolume } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, radius, spacing, type } from '../../theme';

const openDay = (date: string) => router.push({ pathname: '/day/[date]', params: { date } });

export default function TodayScreen() {
  const { settings, schedule, activitiesByDate, connected, syncing, sync, lastSync, syncError, connectStrava } = useStore();
  const todayKey = useTodayKey();
  const today = schedule.get(todayKey);
  const daysToRace = daysBetween(fromKey(todayKey), fromKey(settings.raceDate));
  const result = dayResult(schedule, activitiesByDate, todayKey, todayKey);
  const next = upNext(schedule, activitiesByDate, todayKey);

  const week = today?.week ?? (todayKey < settings.planStart ? 1 : TOTAL_WEEKS);
  const compliance = weekCompliance(schedule, activitiesByDate, week, todayKey);
  const volume = weekVolume(schedule, activitiesByDate, week);
  const doneCount = Math.round(compliance.score);

  // Everything else on today's list: what's already in, then what's still to come after the one up next.
  const others = result.results
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !(next?.date === todayKey && next.index === i));
  const done = others.filter(({ r }) => r.status === 'done' || r.status === 'partial');
  const later = others.filter(({ r }) => r.status === 'today');

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

        {!today && todayKey < settings.planStart && <Empty text={`The plan starts on ${formatDay(fromKey(settings.planStart))}.`} />}
        {today && result.results.length === 0 && (
          <Card>
            <Text style={type.body}>Rest day today. Recovery is part of the plan.</Text>
          </Card>
        )}

        {next ? <UpNextCard next={next} todayKey={todayKey} /> : today === undefined && todayKey > settings.planStart && <Empty text="The plan has finished." />}

        {later.length > 0 && <Text style={type.heading}>Later today</Text>}
        {later.map(({ r, i }) => (
          <Pressable key={i} onPress={() => openDay(todayKey)}>
            <WorkoutCard result={r} />
          </Pressable>
        ))}

        {done.length > 0 && <Text style={type.heading}>Done today</Text>}
        {done.map(({ r, i }) => (
          <Pressable key={i} onPress={() => openDay(todayKey)}>
            <WorkoutCard result={r} />
          </Pressable>
        ))}

        {result.extras.length > 0 && (
          <Card title="Also today" note="Recorded on your watch but not in the plan">
            {result.extras.map((a) => (
              <Text key={a.id} style={type.body}>
                {a.name}
              </Text>
            ))}
          </Card>
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
            <WeekStrip days={daysOfWeek(schedule, week)} schedule={schedule} activitiesByDate={activitiesByDate} todayKey={todayKey} />
          </Card>
        )}
        <View style={{ height: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** The next workout, big and in its sport's colour, with its warm-up, main set and cool-down. */
function UpNextCard({ next, todayKey }: { next: UpNext; todayKey: string }) {
  const { workout } = next.result;
  const blocks = stepBlocks(workout);
  const when =
    next.date === todayKey
      ? 'Up next'
      : next.date === toKey(addDays(fromKey(todayKey), 1))
        ? 'Next · tomorrow'
        : `Next · ${fromKey(next.date).toLocaleDateString(undefined, { weekday: 'long' })}`;
  const unit = workout.kind === 'swim' ? '' : ' min';

  return (
    <Pressable onPress={() => openDay(next.date)} style={[styles.hero, { backgroundColor: tintOf(workout.kind), borderColor: colorOf(workout.kind) }]} accessibilityRole="button">
      <View style={styles.between}>
        <Text style={[styles.heroLabel, { color: colorOf(workout.kind) }]}>{when.toUpperCase()}</Text>
        <Text style={[styles.heroLabel, { color: colorOf(workout.kind) }]}>{SPORT_LABELS[workout.kind].toUpperCase()}</Text>
      </View>
      <Text style={styles.heroTitle}>{workout.title}</Text>
      <Text style={[styles.heroAmount, { color: colorOf(workout.kind) }]}>{plannedAmount(workout)}</Text>

      {blocks && (
        <View style={styles.bar}>
          {blocks.map((b) => (
            <View key={b.label} style={[styles.block, { flex: b.amount }, b.label === 'Main' && { backgroundColor: colorOf(workout.kind) }]}>
              <Text style={[styles.blockText, b.label === 'Main' && { color: colors.onAccent }]} numberOfLines={1}>
                {b.label} {b.amount}
                {unit}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.steps}>
        {workout.steps.map((line, i) => (
          <Text key={i} style={styles.step}>
            {line}
          </Text>
        ))}
      </View>
      <Text style={styles.heroNote}>Record it on your watch. It ticks off here once Strava has it.</Text>
    </Pressable>
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
  hero: { borderRadius: radius.lg, borderWidth: 1.5, borderLeftWidth: 6, padding: spacing.lg, gap: spacing.sm },
  heroLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.ink },
  heroAmount: { ...type.hero, fontSize: 36, lineHeight: 42 },
  bar: { flexDirection: 'row', gap: 3, height: 26, borderRadius: radius.sm, overflow: 'hidden' },
  block: { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 4 },
  blockText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  steps: { gap: 3 },
  step: { fontSize: 14, lineHeight: 20, color: colors.ink },
  heroNote: { fontSize: 12, color: colors.inkSoft },
  rings: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.xs },
  ring: { alignItems: 'center', gap: 2, flex: 1 },
  ringLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  ringAmount: { fontSize: 11, color: colors.inkSoft, fontFamily: 'monospace' },
});
