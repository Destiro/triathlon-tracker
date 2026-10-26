import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { addDays, formatDate, fromKey, isValidKey, toKey } from '../lib/dates';
import { formatDuration, formatSportDistance, formatSportPace, parseDistance, parseDuration, relativeDays, sportLabel } from '../lib/format';
import { daysUntil, goalSplits, predictFinish, RACE_DISTANCES, raceLabel, raceLegs } from '../lib/races';
import { newId } from '../lib/workout';
import { useStore } from '../store';
import { colors, radius, spacing, sportColors, type } from '../theme';
import { Race, RaceDistanceId } from '../types';
import { FormModal, PageModal } from './modals';
import { Button, Card, Chip, Field, SectionTitle, SportBadge, Stat } from './ui';

export function RaceCard({ race, onPress }: { race: Race; onPress: () => void }) {
  const { workouts } = useStore();
  const [today] = useState(() => new Date());
  const days = daysUntil(race, today);
  const prediction = predictFinish(race, workouts, today);
  return (
    <Card onPress={onPress}>
      <View style={styles.raceTop}>
        <SportBadge sport="race" size={40} />
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>{race.name}</Text>
          <Text style={type.small}>
            {raceLabel(race)} · {formatDate(fromKey(race.date))}
          </Text>
        </View>
        <View style={[styles.countdown, days < 0 && { backgroundColor: colors.line }]}>
          <Text style={[styles.countdownNumber, days < 0 && { color: colors.inkSoft }]}>{days < 0 ? '✓' : days}</Text>
          <Text style={[styles.countdownLabel, days < 0 && { color: colors.inkSoft }]}>{days < 0 ? 'done' : days === 1 ? 'day' : 'days'}</Text>
        </View>
      </View>
      {days >= 0 ? (
        <View style={styles.stats}>
          <Stat label="Predicted" value={formatDuration(prediction.totalSec)} />
          {race.goalSec ? <Stat label="Goal" value={formatDuration(race.goalSec)} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

/** A race's details and a leg-by-leg finish prediction. Mount it to open. */
export function RaceDetail({ race, onClose, onPlan }: { race: Race; onClose: () => void; onPlan: () => void }) {
  const { workouts, settings, plan, deleteRace } = useStore();
  const [editing, setEditing] = useState(false);
  const [today] = useState(() => new Date());
  const units = settings.units;
  const days = daysUntil(race, today);
  const p = predictFinish(race, workouts, today);
  const anyEstimate = p.legs.some((l) => l.estimated && l.distanceM > 0);
  const diff = race.goalSec ? p.totalSec - race.goalSec : null;
  const targets = race.goalSec && days >= 0 ? goalSplits(p, race.goalSec) : null;

  const confirmDelete = () =>
    Alert.alert(`Delete ${race.name}?`, plan?.raceId === race.id ? 'Its training plan will be deleted too.' : 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteRace(race.id);
          onClose();
        },
      },
    ]);

  return (
    <PageModal title={race.name} onClose={onClose} action={<Button label="Edit" variant="quiet" onPress={() => setEditing(true)} />}>
      <Text style={type.title}>{race.name}</Text>
      <Text style={type.body}>
        {raceLabel(race)} · {formatDate(fromKey(race.date))} · {relativeDays(days)}
      </Text>

      <SectionTitle>Predicted finish</SectionTitle>
      <Card>
        <Text style={styles.bigTime}>{formatDuration(p.totalSec)}</Text>
        {diff !== null ? (
          <Text style={[type.body, { color: diff <= 0 ? colors.success : colors.warning }]}>
            {diff <= 0 ? `${formatDuration(-diff)} inside your goal of ${formatDuration(race.goalSec!)}` : `${formatDuration(diff)} slower than your goal of ${formatDuration(race.goalSec!)}`}
          </Text>
        ) : null}
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {[
            p.legs[0],
            { sport: 'transition' as const, distanceM: 0, durationSec: p.t1Sec, estimated: true, label: 'T1' },
            p.legs[1],
            { sport: 'transition' as const, distanceM: 0, durationSec: p.t2Sec, estimated: true, label: 'T2' },
            p.legs[2],
          ].map((leg, i) => (
            <View key={i} style={styles.leg}>
              <SportBadge sport={leg.sport} size={30} />
              <Text style={[type.body, { flex: 1 }]}>
                {'label' in leg ? leg.label : sportLabel(leg.sport)}
                {leg.distanceM > 0 ? ` · ${formatSportDistance(leg.sport, leg.distanceM, units)}` : ''}
              </Text>
              {leg.estimated && leg.sport !== 'transition' ? <Text style={styles.estimate}>typical pace</Text> : null}
              <Text style={[type.body, styles.legTime]}>{formatDuration(leg.durationSec)}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Text style={type.small}>
        Based on your best efforts in the last 60 days, scaled to race distance (sessions shorter than a quarter of a leg don&apos;t count).
        {anyEstimate ? ' Legs marked "typical pace" have no recent training yet, so an average age-group pace is used.' : ''} Transitions use typical times.
      </Text>

      {targets ? (
        <>
          <SectionTitle>Race-day targets for {formatDuration(race.goalSec!)}</SectionTitle>
          <Card>
            {targets.legs
              .filter((l) => l.distanceM > 0)
              .map((l) => (
                <View key={l.sport} style={styles.leg}>
                  <SportBadge sport={l.sport} size={30} />
                  <Text style={[type.body, { flex: 1 }]}>{sportLabel(l.sport)}</Text>
                  <Text style={[type.small, { fontVariant: ['tabular-nums'] }]}>{formatSportPace(l.sport, l.durationSec, l.distanceM, units)}</Text>
                  <Text style={[type.body, styles.legTime]}>{formatDuration(l.durationSec)}</Text>
                </View>
              ))}
            <Text style={type.small}>
              The pace or speed to hold on each leg to finish in your goal time, with transitions of {formatDuration(targets.t1Sec)} and {formatDuration(targets.t2Sec)}. Time is shared between the legs the way your training suggests.
            </Text>
          </Card>
        </>
      ) : null}

      {days >= 0 ? (
        <Button label={plan?.raceId === race.id ? 'View training plan' : 'Build a training plan'} icon="calendar-check" onPress={onPlan} big />
      ) : null}
      {race.notes ? (
        <Card>
          <Text style={type.label}>Notes</Text>
          <Text style={type.body}>{race.notes}</Text>
        </Card>
      ) : null}
      <Button label="Delete race" variant="danger" icon="trash-can-outline" onPress={confirmDelete} />

      {editing && <RaceForm race={race} onClose={() => setEditing(false)} />}
    </PageModal>
  );
}

const PRESETS: RaceDistanceId[] = ['sprint', 'olympic', 'half', 'full', 'custom'];

/** Add or edit a race. Mount it to open. */
export function RaceForm({ race, onClose, onSaved }: { race?: Race; onClose: () => void; onSaved?: (r: Race) => void }) {
  const { settings, saveRace } = useStore();
  const units = settings.units;
  const [defaultDate] = useState(() => toKey(addDays(new Date(), 84)));
  const [name, setName] = useState(race?.name ?? '');
  const [date, setDate] = useState(race?.date ?? defaultDate);
  const [distance, setDistance] = useState<RaceDistanceId>(race?.distance ?? 'olympic');
  const legs = race ? raceLegs(race) : RACE_DISTANCES.olympic.legs;
  const toUnits = (m: number, sport: 'swim' | 'bike' | 'run') =>
    sport === 'swim' ? String(Math.round(units === 'imperial' ? m / 0.9144 : m)) : String(Math.round((m / (units === 'imperial' ? 1609.344 : 1000)) * 10) / 10);
  const [swim, setSwim] = useState(toUnits(legs.swimM, 'swim'));
  const [bike, setBike] = useState(toUnits(legs.bikeM, 'bike'));
  const [run, setRun] = useState(toUnits(legs.runM, 'run'));
  const [goal, setGoal] = useState(race?.goalSec ? formatDuration(race.goalSec) : '');
  const [notes, setNotes] = useState(race?.notes ?? '');
  const [tried, setTried] = useState(false);

  const nameError = name.trim() ? null : 'Give the race a name';
  const dateError = isValidKey(date.trim()) ? null : 'Use the format YYYY-MM-DD';
  const goalSec = goal.trim() ? parseDuration(goal) : null;
  const goalError = goal.trim() && !goalSec ? 'Use h:mm:ss, e.g. 2:45:00' : null;
  const custom =
    distance === 'custom'
      ? { swimM: parseDistance(swim, 'swim', units), bikeM: parseDistance(bike, 'bike', units), runM: parseDistance(run, 'run', units) }
      : null;
  const customError = custom && (custom.swimM === null || custom.bikeM === null || custom.runM === null) ? 'Enter a number for each leg' : null;

  const save = () => {
    setTried(true);
    if (nameError || dateError || goalError || customError) return;
    const next: Race = {
      id: race?.id ?? newId(),
      name: name.trim(),
      date: date.trim(),
      distance,
      ...(custom ? { custom: { swimM: custom.swimM!, bikeM: custom.bikeM!, runM: custom.runM! } } : {}),
      ...(goalSec ? { goalSec } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    saveRace(next);
    onSaved?.(next);
    onClose();
  };

  return (
    <FormModal title={race ? 'Edit race' : 'Add a race'} onClose={onClose}>
      <Field label="Race name" value={name} onChangeText={setName} placeholder="e.g. Taupo Half" error={tried ? nameError : null} />
      <Field label="Race day" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={tried ? dateError : null} autoCorrect={false} />
      <Text style={type.label}>Distance</Text>
      <View style={styles.wrap}>
        {PRESETS.map((d) => (
          <Chip key={d} label={d === 'custom' ? 'Custom' : RACE_DISTANCES[d].label} selected={distance === d} onPress={() => setDistance(d)} color={sportColors.race} />
        ))}
      </View>
      {distance === 'custom' ? (
        <Card>
          <Field label={`Swim (${units === 'imperial' ? 'yd' : 'm'})`} value={swim} onChangeText={setSwim} keyboardType="decimal-pad" />
          <Field label={`Bike (${units === 'imperial' ? 'mi' : 'km'})`} value={bike} onChangeText={setBike} keyboardType="decimal-pad" />
          <Field label={`Run (${units === 'imperial' ? 'mi' : 'km'})`} value={run} onChangeText={setRun} keyboardType="decimal-pad" error={tried ? customError : null} />
        </Card>
      ) : (
        <Text style={type.small}>
          {(() => {
            const l = RACE_DISTANCES[distance].legs;
            return `Swim ${formatSportDistance('swim', l.swimM, units)}, bike ${formatSportDistance('bike', l.bikeM, units)}, run ${formatSportDistance('run', l.runM, units)}`;
          })()}
        </Text>
      )}
      <Field label="Goal time (optional)" value={goal} onChangeText={setGoal} placeholder="e.g. 2:45:00" keyboardType="numbers-and-punctuation" error={tried ? goalError : null} />
      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Course, travel, kit…" multiline />
      <Button label="Save race" onPress={save} big />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  raceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  countdown: { backgroundColor: sportColors.race, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: spacing.sm, alignItems: 'center', minWidth: 56 },
  countdownNumber: { fontSize: 20, fontWeight: '800', color: colors.white, fontVariant: ['tabular-nums'] },
  countdownLabel: { fontSize: 11, fontWeight: '700', color: colors.white, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', gap: spacing.md },
  bigTime: { fontSize: 40, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  leg: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legTime: { width: 80, textAlign: 'right', fontVariant: ['tabular-nums'] },
  estimate: { fontSize: 11, color: colors.warning, backgroundColor: colors.warningSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
