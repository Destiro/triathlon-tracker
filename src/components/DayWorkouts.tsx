import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { fromKey } from '../dates';
import { formatRunPace, formatSpeed, formatSwimPace } from '../format';
import { sessionIdOf } from '../plan/edits';
import { PlannedWorkout } from '../plan/types';
import { dayResult, highestHeartRate } from '../stats';
import { useStore, useTodayKey } from '../store';
import { colors, radius, spacing, type } from '../theme';
import { targetZones, zoneSeconds } from '../zones';
import { MoveSheet } from './PlanSheets';
import { SportBadge } from './sport';
import { Card } from './ui';
import { CardAction, doneSummary, WorkoutCard } from './WorkoutCard';
import { ZoneBars } from './ZoneBars';

/**
 * Everything about one day's training in one place: each planned workout with its steps, what the watch recorded
 * for it, and rows to move it or remove it; then anything recorded that the plan didn't ask for. Used for Today
 * and for any other day, so neither needs a screen of its own to open a workout.
 */
export function DayWorkouts({ date }: { date: string }) {
  const { schedule, activities, settings, activitiesByDate, moveWorkout, removeSession, setOpenWater } = useStore();
  const todayKey = useTodayKey();
  const [moving, setMoving] = useState<PlannedWorkout | null>(null);
  const day = schedule.get(date);
  if (!day) return null;
  const result = dayResult(schedule, activitiesByDate, date, todayKey);
  // The same max heart rate the training load uses: the setting, or higher if the watch has seen higher.
  const maxHr = Math.max(settings.maxHr, highestHeartRate(activities));

  const askRemove = (w: PlannedWorkout) => {
    const id = sessionIdOf(w.id ?? '');
    if (!w.repeats) {
      Alert.alert('Remove this session?', w.title, [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeSession(id, 'one') },
      ]);
      return;
    }
    Alert.alert('Remove this session?', `${w.title} repeats every week.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Just this one', onPress: () => removeSession(id, 'one') },
      { text: 'This and later weeks', style: 'destructive', onPress: () => removeSession(id, 'later') },
    ]);
  };

  /** What can be done to a workout, as rows along the bottom of its card. A finished workout stays where it is. */
  const actionsFor = (w: PlannedWorkout, done: boolean): CardAction[] => {
    const actions: CardAction[] = [];
    if (w.id && w.kind !== 'race' && !done) actions.push({ label: 'Move to another day', icon: 'calendar-arrow-right', onPress: () => setMoving(w) });
    if (w.movedFrom) {
      const planned = fromKey(w.movedFrom).toLocaleDateString(undefined, { weekday: 'long' });
      actions.push({ label: `Put back on ${planned}`, icon: 'undo', onPress: () => moveWorkout(w.id!, w.movedFrom!, w.movedFrom!) });
    }
    if (w.custom) actions.push({ label: 'Remove', icon: 'trash-can-outline', danger: true, onPress: () => askRemove(w) });
    return actions;
  };

  return (
    <>
      {result.results.length === 0 && (
        <Card>
          <Text style={type.body}>Rest day. Recovery is part of the plan.</Text>
        </Card>
      )}

      {result.results.map((r, i) => (
        <View key={r.workout.id ?? i} style={{ gap: spacing.sm }}>
          <WorkoutCard result={r} detailed actions={actionsFor(r.workout, r.status === 'done')} />
          {r.activities.map((a) => (
            <Card key={a.id}>
              <View style={styles.titleRow}>
                <Text style={[type.heading, { flex: 1 }]}>{a.name}</Text>
                {a.sport === 'swim' && (
                  <Pressable
                    onPress={() => setOpenWater(a.id, !a.openWater)}
                    style={styles.water}
                    accessibilityRole="button"
                    accessibilityLabel={`Swim recorded in ${a.openWater ? 'open water' : 'a pool'}. Tap to change.`}
                  >
                    <MaterialCommunityIcons name="swap-horizontal" size={14} color={colors.accent} />
                    <Text style={styles.waterText}>{a.openWater ? 'Open water' : 'Pool'}</Text>
                  </Pressable>
                )}
              </View>
              <Text style={type.small}>{doneSummary(a)}</Text>
              <Text style={type.small}>
                {[
                  a.sport === 'run' ? formatRunPace(a.avgSpeed) : a.sport === 'swim' ? formatSwimPace(a.avgSpeed) : a.sport === 'bike' ? formatSpeed(a.avgSpeed) : '',
                  a.avgHr ? `${Math.round(a.avgHr)} bpm average` : '',
                  a.elevationM >= 10 ? `${Math.round(a.elevationM)} m climbing` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {a.hr && <ZoneBars seconds={zoneSeconds(a.hr, maxHr)} target={targetZones(r.workout)} maxHr={maxHr} />}
            </Card>
          ))}
        </View>
      ))}

      {result.extras.length > 0 && (
        <>
          <Text style={type.heading}>Not in the plan</Text>
          {result.extras.map((a) => (
            <Card key={a.id}>
              <View style={styles.extra}>
                <SportBadge kind={a.sport} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{a.name}</Text>
                  <Text style={type.small}>{doneSummary(a)}</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      )}

      {moving && (
        <MoveSheet
          visible
          workoutTitle={moving.title}
          schedule={schedule}
          currentDate={date}
          onClose={() => setMoving(null)}
          onMove={(to) => {
            moveWorkout(moving.id!, to, moving.movedFrom ?? date);
            setMoving(null);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  water: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: spacing.sm },
  waterText: { fontSize: 12, fontWeight: '700', color: colors.accent },
  extra: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
