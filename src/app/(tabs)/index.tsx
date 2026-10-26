import { router } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colorOf, SPORT_LABELS, tintOf } from '../../components/sport';
import { Button, Card, Empty } from '../../components/ui';
import { WorkoutCard } from '../../components/WorkoutCard';
import { daysBetween, formatDay, fromKey } from '../../dates';
import { formatAgo, formatMinutes } from '../../format';
import { daysOfWeek, PHASE_LABELS, TOTAL_WEEKS } from '../../plan/schedule';
import { dayResult, SPORTS, unitOf, weekCompliance, weekVolume } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, radius, spacing, sportColors, type } from '../../theme';

export default function TodayScreen() {
  const { settings, schedule, activitiesByDate, connected, syncing, sync, lastSync, syncError, connectStrava } = useStore();
  const todayKey = useTodayKey();
  const today = schedule.get(todayKey);
  const daysToRace = daysBetween(fromKey(todayKey), fromKey(settings.raceDate));
  const result = dayResult(schedule, activitiesByDate, todayKey, todayKey);

  const week = today?.week ?? (todayKey < settings.planStart ? 1 : TOTAL_WEEKS);
  const weekDays = daysOfWeek(schedule, week);
  const compliance = weekCompliance(schedule, activitiesByDate, week, todayKey);
  const volume = weekVolume(schedule, activitiesByDate, week);
  const openDay = (date: string) => router.push({ pathname: '/day/[date]', params: { date } });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} colors={[colors.accent]} />}
      >
        <View>
          <Text style={type.title}>{daysToRace > 0 ? `${daysToRace} days to race` : daysToRace === 0 ? 'Race day!' : 'Race done'}</Text>
          <Text style={type.small}>
            {settings.raceName} · {fromKey(settings.raceDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>

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

        <View style={styles.weekHeader}>
          <Text style={type.heading}>
            Week {week} of {TOTAL_WEEKS}
          </Text>
          <Text style={styles.phase}>
            {today ? PHASE_LABELS[today.phase] : ''}
            {today?.recovery ? ' · recovery week' : ''}
          </Text>
        </View>

        <View style={styles.strip}>
          {weekDays.map((d) => {
            const r = dayResult(schedule, activitiesByDate, d.date, todayKey);
            const isToday = d.date === todayKey;
            return (
              <Pressable key={d.date} style={[styles.stripDay, isToday && styles.stripToday]} onPress={() => openDay(d.date)}>
                <Text style={[styles.stripLabel, isToday && { color: colors.accent, fontWeight: '700' }]}>
                  {fromKey(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
                </Text>
                <View style={styles.dots}>
                  {d.workouts.length === 0 && <View style={[styles.dot, { backgroundColor: colors.line, borderColor: colors.line }]} />}
                  {d.workouts.map((w, i) => {
                    const status = r.results[i]?.status;
                    const done = status === 'done' || status === 'partial';
                    return (
                      <View key={i} style={[styles.dot, { backgroundColor: done ? colorOf(w.kind) : tintOf(w.kind), borderColor: colorOf(w.kind) }]} />
                    );
                  })}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={type.heading}>Today · {formatDay(fromKey(todayKey))}</Text>
        {!today ? (
          <Empty text={todayKey < settings.planStart ? `The plan starts on ${formatDay(fromKey(settings.planStart))}.` : 'The plan has finished.'} />
        ) : result.results.length === 0 ? (
          <Card>
            <Text style={type.body}>Rest day. Recovery is part of the plan.</Text>
          </Card>
        ) : (
          result.results.map((r, i) => (
            <Pressable key={i} onPress={() => openDay(todayKey)}>
              <WorkoutCard result={r} detailed />
            </Pressable>
          ))
        )}
        {result.extras.length > 0 && (
          <Card>
            <Text style={type.heading}>Also today</Text>
            <Text style={type.small}>Recorded on your watch but not in the plan</Text>
            {result.extras.map((a) => (
              <Text key={a.id} style={type.body}>
                {a.name}
              </Text>
            ))}
          </Card>
        )}

        <Card>
          <Text style={type.heading}>This week</Text>
          <Text style={type.small}>
            {compliance.due ? `${Math.round((compliance.score / compliance.due) * 100)}% of planned workouts done so far` : 'No workouts due yet'}
          </Text>
          {SPORTS.map((s) => {
            const v = volume[s];
            const pct = v.planned ? Math.min(v.actual / v.planned, 1) : 0;
            const text =
              unitOf(s) === 'metres'
                ? `${Math.round(v.actual).toLocaleString()} / ${Math.round(v.planned).toLocaleString()} m`
                : `${formatMinutes(v.actual)} / ${formatMinutes(v.planned)}`;
            return (
              <View key={s} style={{ gap: 4 }}>
                <View style={styles.barLabel}>
                  <Text style={type.body}>{SPORT_LABELS[s]}</Text>
                  <Text style={type.small}>{text}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: tintOf(s) }]}>
                  <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: sportColors[s] }]} />
                </View>
              </View>
            );
          })}
        </Card>
        <View style={{ height: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  error: { color: colors.danger },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm },
  phase: { fontSize: 13, fontWeight: '600', color: colors.accent },
  strip: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.xs },
  stripDay: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm, gap: 6 },
  stripToday: { backgroundColor: colors.accentSoft },
  stripLabel: { fontSize: 12, color: colors.inkSoft },
  dots: { flexDirection: 'row', gap: 3, height: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  barLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
