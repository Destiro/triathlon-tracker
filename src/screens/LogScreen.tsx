import React, { useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, EmptyState } from '../components/ui';
import { WorkoutDetail, WorkoutForm, WorkoutRow } from '../components/workouts';
import { formatDate, fromKey, startOfWeek, toKey } from '../lib/dates';
import { formatHours } from '../lib/format';
import { byNewest, primarySport, workoutDuration } from '../lib/workout';
import { useStore } from '../store';
import { colors, spacing, sportColors, sportIcons, type } from '../theme';
import { Workout } from '../types';

type Filter = 'all' | 'swim' | 'bike' | 'run' | 'strength' | 'multisport';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'swim', label: 'Swim' },
  { value: 'bike', label: 'Bike' },
  { value: 'run', label: 'Run' },
  { value: 'strength', label: 'Strength' },
  { value: 'multisport', label: 'Brick / race' },
];

/** Every workout, newest first, grouped into weeks with a total for each. */
export default function LogScreen() {
  const { workouts } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const sections = useMemo(() => {
    const shown = workouts.filter((w) => filter === 'all' || primarySport(w) === filter || (filter !== 'multisport' && w.segments.some((s) => s.sport === filter)));
    const byWeek = new Map<string, Workout[]>();
    for (const w of [...shown].sort(byNewest)) {
      const key = toKey(startOfWeek(new Date(w.startedAt)));
      byWeek.set(key, [...(byWeek.get(key) ?? []), w]);
    }
    return [...byWeek.entries()].map(([week, data]) => ({ week, data, total: data.reduce((s, w) => s + workoutDuration(w), 0) }));
  }, [workouts, filter]);

  // Looked up fresh, so the detail page shows edits as soon as they're saved.
  const open = workouts.find((w) => w.id === openId) ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={type.title}>Training log</Text>
        <Button label="Add" icon="plus" onPress={() => setAdding(true)} />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={filter === f.value}
              onPress={() => setFilter(f.value)}
              color={f.value === 'all' ? colors.accent : sportColors[f.value]}
              icon={f.value === 'all' ? undefined : sportIcons[f.value]}
            />
          ))}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.weekHeader}>
            <Text style={type.label}>Week of {formatDate(fromKey(section.week))}</Text>
            <Text style={type.small}>
              {formatHours(section.total)} · {section.data.length} {section.data.length === 1 ? 'session' : 'sessions'}
            </Text>
          </View>
        )}
        renderItem={({ item }) => <WorkoutRow workout={item} onPress={() => setOpenId(item.id)} />}
        ListEmptyComponent={
          workouts.length === 0 ? (
            <EmptyState
              icon="notebook-outline"
              title="No workouts yet"
              body="Record one live on the Track tab, or add a session you've already done."
              action={<Button label="Add a workout" icon="plus" onPress={() => setAdding(true)} />}
            />
          ) : (
            <EmptyState icon="filter-variant" title="Nothing here" body="No workouts match this filter." />
          )
        }
      />

      {open && <WorkoutDetail workout={open} onClose={() => setOpenId(null)} />}
      {adding && <WorkoutForm sport={filter === 'all' || filter === 'multisport' ? 'run' : filter} onClose={() => setAdding(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.md },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: spacing.lg, paddingBottom: spacing.sm },
});
