import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Activity } from '../activities';
import { formatClock, formatDistance, formatMinutes } from '../format';
import { Status, WorkoutResult } from '../matching';
import { PlannedWorkout } from '../plan/types';
import { colors, radius, spacing, type } from '../theme';
import { colorOf, SPORT_LABELS, SportBadge } from './sport';

const STATUS: Record<Status, { icon: string; color: string; label: string }> = {
  done: { icon: 'check-circle', color: colors.accent, label: 'Done' },
  partial: { icon: 'check-circle-outline', color: colors.warning, label: 'Partly done' },
  missed: { icon: 'close-circle-outline', color: colors.danger, label: 'Missed' },
  today: { icon: 'clock-outline', color: colors.inkSoft, label: 'Today' },
  upcoming: { icon: 'circle-outline', color: colors.line, label: 'Planned' },
};

/** "1,300 m", "1 h 15", or the legs of a brick or race. */
export function plannedAmount(w: PlannedWorkout): string {
  if (w.kind === 'swim' && w.metres) return formatDistance(w.metres, true);
  if (w.legs?.some((l) => l.metres)) return w.legs.map((l) => formatDistance(l.metres ?? 0)).join(' · ');
  if (w.minutes) return formatMinutes(w.minutes);
  return '';
}

export const doneSummary = (a: Activity): string =>
  [a.distanceM > 0 ? formatDistance(a.distanceM, a.sport === 'swim') : '', formatClock(a.movingS)].filter(Boolean).join(' · ');

interface Props {
  result: WorkoutResult;
  /** Show the warm-up / main set / cool-down lines. */
  detailed?: boolean;
}

export function WorkoutCard({ result, detailed }: Props) {
  const { workout, status, activities } = result;
  const s = STATUS[status];
  return (
    <View style={[styles.card, { borderLeftColor: colorOf(workout.kind) }]}>
      <View style={styles.row}>
        <SportBadge kind={workout.kind} />
        <View style={styles.main}>
          <Text style={type.heading}>{workout.title}</Text>
          <Text style={type.small}>
            {SPORT_LABELS[workout.kind]}
            {plannedAmount(workout) ? ` · ${plannedAmount(workout)}` : ''}
          </Text>
        </View>
        <View style={styles.status} accessibilityLabel={s.label}>
          <MaterialCommunityIcons name={s.icon as never} size={26} color={s.color} />
        </View>
      </View>

      {activities.map((a) => (
        <Text key={a.id} style={styles.done}>
          {a.name} · {doneSummary(a)}
        </Text>
      ))}

      {detailed && (
        <View style={styles.steps}>
          {workout.steps.map((line, i) => (
            <Text key={i} style={styles.step}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 5,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  main: { flex: 1 },
  status: { width: 28, alignItems: 'center' },
  done: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  steps: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.sm },
  step: { fontSize: 14, color: colors.ink, lineHeight: 20 },
});
