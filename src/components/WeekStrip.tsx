import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Activity } from '../activities';
import { formatDay, fromKey } from '../dates';
import { ScheduledDay, Schedule } from '../plan/schedule';
import { dayResult } from '../stats';
import { colors, radius, spacing } from '../theme';
import { colorOf, tintOf } from './sport';

interface Props {
  days: ScheduledDay[];
  schedule: Schedule;
  activitiesByDate: Map<string, Activity[]>;
  todayKey: string;
}

/** Monday to Sunday, one dot per workout: solid once done, faded while still to do. Tap a day to open it. */
export function WeekStrip({ days, schedule, activitiesByDate, todayKey }: Props) {
  return (
    <View style={styles.strip}>
      {days.map((d) => {
        const r = dayResult(schedule, activitiesByDate, d.date, todayKey);
        const isToday = d.date === todayKey;
        return (
          <Pressable
            key={d.date}
            style={[styles.day, isToday && styles.today]}
            onPress={() => router.push({ pathname: '/day/[date]', params: { date: d.date } })}
            accessibilityLabel={formatDay(fromKey(d.date))}
          >
            <Text style={[styles.label, isToday && { color: colors.accent, fontWeight: '700' }]}>
              {fromKey(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
            </Text>
            <View style={styles.dots}>
              {d.workouts.length === 0 && <View style={[styles.dot, { backgroundColor: colors.line, borderColor: colors.line }]} />}
              {d.workouts.map((w, i) => {
                const status = r.results[i]?.status;
                const done = status === 'done' || status === 'partial';
                return <View key={i} style={[styles.dot, { backgroundColor: done ? colorOf(w.kind) : tintOf(w.kind), borderColor: colorOf(w.kind) }]} />;
              })}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.xs },
  day: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm, gap: 6 },
  today: { backgroundColor: colors.accentSoft },
  label: { fontSize: 12, color: colors.inkSoft },
  dots: { flexDirection: 'row', gap: 3, height: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
