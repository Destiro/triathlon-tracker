import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MonthGrid } from '../../components/MonthGrid';
import { AddSessionSheet } from '../../components/PlanSheets';
import { SPORT_LABELS, SportBadge, colorOf } from '../../components/sport';
import { Card } from '../../components/ui';
import { plannedAmount, STATUS } from '../../components/WorkoutCard';
import { addMonths, formatDay, formatMonth, fromKey, startOfMonth } from '../../dates';
import { PHASE_LABELS } from '../../plan/schedule';
import { dayResult } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, radius, spacing, type } from '../../theme';

const LEGEND = ['swim', 'bike', 'run', 'brick', 'gym'] as const;

export default function PlanScreen() {
  const { schedule, activitiesByDate, settings, addSession } = useStore();
  const todayKey = useTodayKey();
  const home = schedule.has(todayKey) ? todayKey : settings.planStart;
  const [selected, setSelected] = useState(home);
  const [month, setMonth] = useState(startOfMonth(fromKey(home)));
  const [adding, setAdding] = useState(false);

  const firstMonth = startOfMonth(fromKey(settings.planStart));
  const lastMonth = startOfMonth(fromKey(settings.raceDate));
  const canGoBack = month > firstMonth;
  const canGoOn = month < lastMonth;

  const day = schedule.get(selected);
  const result = dayResult(schedule, activitiesByDate, selected, todayKey);
  const atHome = selected === home && month.getTime() === startOfMonth(fromKey(home)).getTime();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.titleRow}>
          <Text style={type.title}>Plan</Text>
          {!atHome && (
            <Pressable
              onPress={() => {
                setSelected(home);
                setMonth(startOfMonth(fromKey(home)));
              }}
              style={styles.todayButton}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              <Text style={styles.todayText}>Today</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.monthRow}>
          <Pressable onPress={() => setMonth(addMonths(month, -1))} disabled={!canGoBack} hitSlop={12} accessibilityLabel="Previous month">
            <MaterialCommunityIcons name="chevron-left" size={30} color={canGoBack ? colors.accent : colors.inkFaint} />
          </Pressable>
          <Text style={type.heading}>{formatMonth(month)}</Text>
          <Pressable onPress={() => setMonth(addMonths(month, 1))} disabled={!canGoOn} hitSlop={12} accessibilityLabel="Next month">
            <MaterialCommunityIcons name="chevron-right" size={30} color={canGoOn ? colors.accent : colors.inkFaint} />
          </Pressable>
        </View>

        <MonthGrid
          month={month}
          schedule={schedule}
          activitiesByDate={activitiesByDate}
          todayKey={todayKey}
          selected={selected}
          onSelect={setSelected}
        />

        <View style={styles.legend}>
          {LEGEND.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colorOf(k) }]} />
              <Text style={type.small}>{SPORT_LABELS[k]}</Text>
            </View>
          ))}
        </View>

        {day && (
          <>
            <View style={styles.dayHeader}>
              <Text style={type.heading}>
                {formatDay(fromKey(selected))}
                {selected === todayKey ? ' · Today' : ''}
              </Text>
              <Text style={styles.phase}>
                Week {day.week} · {PHASE_LABELS[day.phase]}
                {day.recovery ? ' · recovery' : ''}
              </Text>
            </View>

            {result.results.length === 0 && (
              <Card>
                <Text style={type.body}>Rest day. Recovery is part of the plan.</Text>
              </Card>
            )}
            {result.results.map((r, i) => {
              const s = STATUS[r.status];
              return (
                <Pressable
                  key={i}
                  onPress={() => router.push({ pathname: '/day/[date]', params: { date: selected } })}
                  style={[styles.workout, { borderLeftColor: colorOf(r.workout.kind) }]}
                  accessibilityRole="button"
                >
                  <SportBadge kind={r.workout.kind} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.heading}>{r.workout.title}</Text>
                    <Text style={type.small}>
                      {SPORT_LABELS[r.workout.kind]}
                      {plannedAmount(r.workout) ? ` · ${plannedAmount(r.workout)}` : ''}
                      {r.workout.custom ? ' · added by you' : ''}
                      {r.workout.movedFrom ? ' · moved' : ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name={s.icon as never} size={24} color={s.color} accessibilityLabel={s.label} />
                </Pressable>
              );
            })}
            {result.extras.length > 0 && <Text style={type.small}>Not in the plan: {result.extras.map((a) => a.name).join(', ')}</Text>}

            <Pressable onPress={() => setAdding(true)} style={styles.add} accessibilityRole="button">
              <MaterialCommunityIcons name="plus-circle-outline" size={22} color={colors.accent} />
              <Text style={styles.addText}>Add a session on this day</Text>
            </Pressable>
          </>
        )}
        <View style={{ height: spacing.md }} />
      </ScrollView>

      {adding && (
        <AddSessionSheet
          visible
          schedule={schedule}
          initialDate={selected}
          onClose={() => setAdding(false)}
          onSave={(session) => {
            addSession(session);
            setAdding(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayButton: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md },
  todayText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  dayHeader: { gap: 2, marginTop: spacing.sm },
  phase: { fontSize: 13, fontWeight: '600', color: colors.accent },
  workout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 5,
    padding: spacing.md,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  addText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
});
