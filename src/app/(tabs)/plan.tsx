import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colorOf, tintOf } from '../../components/sport';
import { formatDay, fromKey } from '../../dates';
import { formatMinutes } from '../../format';
import { daysOfWeek, PHASE_LABELS, TOTAL_WEEKS } from '../../plan/schedule';
import { dayResult, SPORTS, unitOf, weekCompliance, weekVolume } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, radius, spacing, type } from '../../theme';

export default function PlanScreen() {
  const { schedule, activitiesByDate, settings } = useStore();
  const todayKey = useTodayKey();
  const currentWeek = schedule.get(todayKey)?.week ?? (todayKey < settings.planStart ? 1 : TOTAL_WEEKS);
  const scroll = useRef<ScrollViewInstance>(null);
  const weekY = useRef<Record<number, number>>({});

  // Open at the current week rather than the top of a 20-week list.
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollTo({ y: Math.max((weekY.current[currentWeek] ?? 0) - spacing.lg, 0), animated: false }), 50);
    return () => clearTimeout(timer);
  }, [currentWeek]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView ref={scroll} contentContainerStyle={styles.list}>
        <Text style={type.title}>Training plan</Text>
        <Text style={type.small}>20 weeks to {settings.raceName}. Tap a day to see the workout.</Text>

        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => {
          const days = daysOfWeek(schedule, week);
          if (days.length === 0) return null;
          const first = days[0];
          const compliance = weekCompliance(schedule, activitiesByDate, week, todayKey);
          const volume = weekVolume(schedule, activitiesByDate, week);
          const isCurrent = week === currentWeek;
          return (
            <View
              key={week}
              onLayout={(e) => (weekY.current[week] = e.nativeEvent.layout.y)}
              style={[styles.card, isCurrent && styles.cardCurrent]}
            >
              <View style={styles.cardHeader}>
                <Text style={type.heading}>Week {week}</Text>
                <Text style={styles.phase}>
                  {PHASE_LABELS[first.phase]}
                  {first.recovery ? ' · recovery' : ''}
                </Text>
              </View>
              <Text style={type.small}>
                {fromKey(first.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} –{' '}
                {fromKey(days[days.length - 1].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                {compliance.due ? ` · ${Math.round((compliance.score / compliance.due) * 100)}% done` : ''}
              </Text>

              <View style={styles.week}>
                {days.map((d) => {
                  const r = dayResult(schedule, activitiesByDate, d.date, todayKey);
                  return (
                    <Pressable
                      key={d.date}
                      style={[styles.day, d.date === todayKey && styles.dayToday]}
                      onPress={() => router.push({ pathname: '/day/[date]', params: { date: d.date } })}
                      accessibilityLabel={formatDay(fromKey(d.date))}
                    >
                      <Text style={styles.dayLabel}>{fromKey(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
                      <View style={styles.dots}>
                        {d.workouts.length === 0 && <View style={[styles.dot, { borderColor: colors.line, backgroundColor: colors.line }]} />}
                        {d.workouts.map((w, i) => {
                          const status = r.results[i]?.status;
                          const done = status === 'done' || status === 'partial';
                          return <View key={i} style={[styles.dot, { borderColor: colorOf(w.kind), backgroundColor: done ? colorOf(w.kind) : tintOf(w.kind) }]} />;
                        })}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={type.small}>
                {SPORTS.map((s) =>
                  unitOf(s) === 'metres'
                    ? `Swim ${(volume[s].planned / 1000).toFixed(1)} km`
                    : `${s === 'bike' ? 'Bike' : 'Run'} ${formatMinutes(volume[s].planned)}`,
                ).join(' · ')}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.sm },
  cardCurrent: { borderColor: colors.accent, borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  phase: { fontSize: 13, fontWeight: '600', color: colors.accent },
  week: { flexDirection: 'row', gap: 2 },
  day: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm, gap: 6 },
  dayToday: { backgroundColor: colors.accentSoft },
  dayLabel: { fontSize: 12, color: colors.inkSoft },
  dots: { flexDirection: 'row', gap: 3, height: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
