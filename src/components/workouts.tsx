import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate, formatDay, formatTime, isValidKey, toKey } from '../lib/dates';
import {
  distanceUnitLabel,
  formatDuration,
  formatPace,
  formatSportDistance,
  formatSportPace,
  parseDistance,
  parseDuration,
  sportLabel,
} from '../lib/format';
import { gearKindsFor, GEAR_LABELS } from '../lib/gear';
import { trainingStress } from '../lib/load';
import { primarySport, workoutDistance, workoutDuration, workoutTitle, newId } from '../lib/workout';
import { hrZones, zoneFor } from '../lib/zones';
import { useStore } from '../store';
import { colors, radius, spacing, sportColors, type } from '../theme';
import { Segment, Sport, TRAINING_SPORTS, Workout } from '../types';
import { RouteMap, SplitBars } from './charts';
import { FormModal, PageModal } from './modals';
import { Button, Card, Chip, Field, RpePicker, SectionTitle, Segmented, SportBadge, Stat } from './ui';

/** The headline numbers for a workout: distance, and pace or speed for its main sport. */
function headline(w: Workout, units: 'metric' | 'imperial') {
  const sport = primarySport(w);
  const main = sport === 'multisport' ? null : w.segments.find((s) => s.sport === sport);
  return {
    sport,
    distance: workoutDistance(w) > 0 ? formatSportDistance(sport === 'multisport' ? 'run' : sport, workoutDistance(w), units) : null,
    pace: main && main.distanceM > 0 ? formatSportPace(main.sport, main.durationSec, main.distanceM, units) : null,
  };
}

export function WorkoutRow({ workout, onPress }: { workout: Workout; onPress: () => void }) {
  const { settings } = useStore();
  const h = headline(workout, settings.units);
  const when = new Date(workout.startedAt);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <SportBadge sport={h.sport} size={42} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.heading} numberOfLines={1}>
          {workoutTitle(workout)}
        </Text>
        <Text style={type.small} numberOfLines={1}>
          {formatDay(when)} · {formatTime(when)}
          {workout.source === 'tracked' ? ' · GPS' : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[type.body, styles.tabular]}>{formatDuration(workoutDuration(workout))}</Text>
        {h.distance ? <Text style={type.small}>{h.distance}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Everything about one workout, with edit and delete. Mount it to open. */
export function WorkoutDetail({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const { settings, gear, deleteWorkout } = useStore();
  const [editing, setEditing] = useState(false);
  const units = settings.units;
  const h = headline(workout, units);
  const when = new Date(workout.startedAt);
  const stress = trainingStress(workout, settings);
  const zone = workout.avgHr && settings.maxHr ? zoneFor(workout.avgHr, hrZones(settings.maxHr, settings.restingHr)) : null;
  const climb = workout.segments.reduce((s, x) => s + (x.elevationGainM ?? 0), 0);
  const usedGear = gear.find((g) => g.id === workout.gearId);

  const confirmDelete = () =>
    Alert.alert('Delete this workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteWorkout(workout.id);
          onClose();
        },
      },
    ]);

  return (
    <PageModal title={workoutTitle(workout)} onClose={onClose} action={<Button label="Edit" variant="quiet" onPress={() => setEditing(true)} />}>
      <View style={styles.titleRow}>
        <SportBadge sport={h.sport} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>{workoutTitle(workout)}</Text>
          <Text style={type.small}>
            {formatDate(when)} at {formatTime(when)}
          </Text>
        </View>
      </View>

      <Card>
        <View style={styles.stats}>
          <Stat label="Time" value={formatDuration(workoutDuration(workout))} />
          {h.distance ? <Stat label="Distance" value={h.distance} /> : null}
          {h.pace ? <Stat label={h.sport === 'bike' ? 'Speed' : 'Pace'} value={h.pace} /> : null}
        </View>
        <View style={styles.stats}>
          <Stat label="Training stress" value={String(stress)} sub={stress >= 150 ? 'Big day' : stress >= 80 ? 'Solid' : 'Light'} />
          {workout.rpe ? <Stat label="Effort" value={`${workout.rpe}/10`} /> : null}
          {workout.avgHr ? <Stat label="Avg HR" value={`${workout.avgHr} bpm`} sub={zone ? `Zone ${zone.zone} · ${zone.name}` : undefined} /> : null}
          {climb > 0 ? <Stat label="Climbing" value={`${climb} m`} /> : null}
        </View>
      </Card>

      {workout.route && workout.route.length > 1 ? (
        <>
          <SectionTitle>Route</SectionTitle>
          <RouteMap route={workout.route} height={220} color={sportColors[h.sport]} />
        </>
      ) : null}

      {workout.segments.length > 1 ? (
        <>
          <SectionTitle>Legs</SectionTitle>
          <Card>
            {workout.segments.map((s, i) => (
              <View key={i} style={styles.leg}>
                <SportBadge sport={s.sport} size={28} />
                <Text style={[type.body, { flex: 1 }]}>{sportLabel(s.sport)}</Text>
                <Text style={[type.small, styles.tabular]}>{s.distanceM > 0 ? formatSportDistance(s.sport, s.distanceM, units) : ''}</Text>
                <Text style={[type.body, styles.tabular, { width: 74, textAlign: 'right' }]}>{formatDuration(s.durationSec)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {workout.splitsSec && workout.splitsSec.length > 0 ? (
        <>
          <SectionTitle>{units === 'imperial' ? 'Splits (per km)' : 'Splits'}</SectionTitle>
          <Card>
            <SplitBars
              splitsSec={workout.splitsSec}
              format={(sec) => (h.sport === 'bike' ? formatSportPace('bike', sec, 1000, units) : formatPace(sec, 1000, 'metric').replace(' /km', ''))}
            />
          </Card>
        </>
      ) : null}

      {usedGear ? (
        <Card>
          <Text style={type.label}>Gear</Text>
          <Text style={type.body}>{usedGear.name}</Text>
        </Card>
      ) : null}

      {workout.notes ? (
        <Card>
          <Text style={type.label}>Notes</Text>
          <Text style={type.body}>{workout.notes}</Text>
        </Card>
      ) : null}

      <Button label="Delete workout" variant="danger" icon="trash-can-outline" onPress={confirmDelete} />

      {editing && <WorkoutForm workout={workout} onClose={() => setEditing(false)} />}
    </PageModal>
  );
}

interface LegDraft {
  sport: Sport;
  duration: string;
  distance: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Adds a workout by hand, or edits any workout, tracked ones included. A brick or race is edited leg by
 * leg. Mount it to open; with no `workout` it starts a new one (optionally for a given sport).
 */
export function WorkoutForm({
  workout,
  sport: initialSport = 'run',
  heading,
  onClose,
  onSaved,
}: {
  workout?: Workout;
  sport?: Sport;
  /** Replaces the usual "Add a workout" / "Edit workout" heading. */
  heading?: string;
  onClose: () => void;
  onSaved?: (w: Workout) => void;
}) {
  const { settings, gear, saveWorkout } = useStore();
  const units = settings.units;
  const start = workout ? new Date(workout.startedAt) : new Date();
  const [date, setDate] = useState(toKey(start));
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  const [title, setTitle] = useState(workout?.title ?? '');
  const [legs, setLegs] = useState<LegDraft[]>(
    workout
      ? workout.segments.map((s) => ({
          sport: s.sport,
          duration: formatDuration(s.durationSec),
          distance: s.distanceM > 0 ? String(s.sport === 'swim' ? Math.round(units === 'imperial' ? s.distanceM / 0.9144 : s.distanceM) : Math.round((s.distanceM / (units === 'imperial' ? 1609.344 : 1000)) * 100) / 100) : '',
        }))
      : [{ sport: initialSport, duration: '', distance: '' }],
  );
  const [rpe, setRpe] = useState<number | undefined>(workout?.rpe);
  const [hr, setHr] = useState(workout?.avgHr ? String(workout.avgHr) : '');
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [gearId, setGearId] = useState<string | undefined>(workout?.gearId);
  const [tried, setTried] = useState(false);
  // Fixed when the form opens, for the quick date buttons.
  const [todayKey] = useState(() => toKey(new Date()));
  const [yesterdayKey] = useState(() => toKey(new Date(Date.now() - 86_400_000)));

  const single = legs.length === 1;
  const mainSport = legs.find((l) => l.sport !== 'transition')?.sport ?? legs[0].sport;
  const usableGear = useMemo(() => gear.filter((g) => !g.retired && gearKindsFor(mainSport).includes(g.kind)), [gear, mainSport]);

  const timeMatch = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  const dateError = isValidKey(date.trim()) ? null : 'Use the format YYYY-MM-DD';
  const timeError = timeMatch && Number(timeMatch[1]) < 24 && Number(timeMatch[2]) < 60 ? null : 'Use the format HH:MM';
  const parsed = legs.map((l) => ({
    sport: l.sport,
    durationSec: parseDuration(l.duration),
    distanceM: l.distance.trim() === '' ? 0 : parseDistance(l.distance, l.sport, units),
  }));
  const legErrors = parsed.map((p) =>
    p.durationSec === null || p.durationSec <= 0 ? 'Enter a time, like 45 or 1:05:00' : p.distanceM === null ? 'Enter a number' : null,
  );
  const hrValue = hr.trim() === '' ? undefined : Number(hr);
  const hrError = hrValue === undefined || (Number.isInteger(hrValue) && hrValue >= 30 && hrValue <= 240) ? null : 'Between 30 and 240';
  const valid = !dateError && !timeError && legErrors.every((e) => !e) && !hrError;

  const setLeg = (i: number, change: Partial<LegDraft>) => setLegs(legs.map((l, j) => (j === i ? { ...l, ...change } : l)));

  const save = () => {
    setTried(true);
    if (!valid) return;
    const [y, m, d] = date.trim().split('-').map(Number);
    const startedAt = new Date(y, m - 1, d, Number(timeMatch![1]), Number(timeMatch![2])).toISOString();
    const segments: Segment[] = parsed.map((p, i) => ({
      ...(workout?.segments[i] ?? {}),
      sport: p.sport,
      durationSec: p.durationSec!,
      distanceM: p.distanceM ?? 0,
    }));
    const next: Workout = {
      ...(workout ?? { id: newId(), source: 'manual' as const }),
      startedAt,
      segments,
      title: title.trim() || undefined,
      rpe,
      avgHr: hrValue,
      notes: notes.trim() || undefined,
      gearId,
    };
    saveWorkout(next);
    onSaved?.(next);
    onClose();
  };

  return (
    <FormModal title={heading ?? (workout ? 'Edit workout' : 'Add a workout')} onClose={onClose}>
      {single && !workout ? (
        <Segmented
          options={TRAINING_SPORTS.map((s) => ({ value: s, label: sportLabel(s) }))}
          value={legs[0].sport as (typeof TRAINING_SPORTS)[number]}
          onChange={(s) => {
            setLeg(0, { sport: s });
            setGearId(undefined);
          }}
        />
      ) : null}

      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={tried ? dateError : null} autoCorrect={false} />
        </View>
        <View style={{ width: 110 }}>
          <Field label="Start" value={time} onChangeText={setTime} placeholder="07:00" keyboardType="numbers-and-punctuation" error={tried ? timeError : null} />
        </View>
      </View>
      <View style={styles.quickDates}>
        <Chip label="Today" selected={date === todayKey} onPress={() => setDate(todayKey)} />
        <Chip label="Yesterday" selected={date === yesterdayKey} onPress={() => setDate(yesterdayKey)} />
      </View>

      {legs.map((leg, i) => (
        <Card key={i} style={!single ? { borderLeftWidth: 4, borderLeftColor: sportColors[leg.sport] } : undefined}>
          {!single ? <Text style={type.heading}>{sportLabel(leg.sport)}</Text> : null}
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Field
                label="Time"
                value={leg.duration}
                onChangeText={(v) => setLeg(i, { duration: v })}
                placeholder="45:00"
                keyboardType="numbers-and-punctuation"
                error={tried ? legErrors[i] : null}
                hint="Minutes, or h:mm:ss"
              />
            </View>
            {leg.sport !== 'strength' && leg.sport !== 'transition' ? (
              <View style={{ flex: 1 }}>
                <Field
                  label={`Distance (${distanceUnitLabel(leg.sport, units)})`}
                  value={leg.distance}
                  onChangeText={(v) => setLeg(i, { distance: v })}
                  placeholder={leg.sport === 'swim' ? '1500' : '10'}
                  keyboardType="decimal-pad"
                />
              </View>
            ) : null}
          </View>
        </Card>
      ))}

      <RpePicker value={rpe} onChange={setRpe} />
      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Field label="Avg heart rate (bpm)" value={hr} onChangeText={setHr} keyboardType="number-pad" placeholder="Optional" error={tried ? hrError : null} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="Optional" />
        </View>
      </View>

      {usableGear.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={type.label}>Gear</Text>
          <View style={styles.quickDates}>
            <Chip label="None" selected={!gearId} onPress={() => setGearId(undefined)} />
            {usableGear.map((g) => (
              <Chip key={g.id} label={g.name} selected={gearId === g.id} onPress={() => setGearId(g.id)} icon={g.kind === 'shoes' ? 'shoe-sneaker' : g.kind === 'bike' ? 'bike' : undefined} />
            ))}
          </View>
          <Text style={type.small}>The distance of this workout is added to the {GEAR_LABELS[usableGear[0].kind].toLowerCase()} tally.</Text>
        </View>
      ) : null}

      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="How did it feel?" multiline />
      <Button label="Save workout" onPress={save} big />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabular: { fontVariant: ['tabular-nums'] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.md },
  leg: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  quickDates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
