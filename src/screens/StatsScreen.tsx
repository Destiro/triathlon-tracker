import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadChart, WeeklyBars } from '../components/charts';
import { FormModal } from '../components/modals';
import { Button, Card, Chip, EmptyState, Field, ProgressBar, SectionTitle, Segmented, SportBadge, Stat } from '../components/ui';
import { formatDate } from '../lib/dates';
import { formatDistance, formatDuration, formatHours, formatSportDistance, parseDistance } from '../lib/format';
import { DEFAULT_LIMITS, GEAR_LABELS, wear } from '../lib/gear';
import { describeForm, loadSeries } from '../lib/load';
import { personalBests, totals, VOLUME_SPORTS, weeklyVolume } from '../lib/stats';
import { newId } from '../lib/workout';
import { hrZones } from '../lib/zones';
import { useStore } from '../store';
import { colors, spacing, sportColors, type } from '../theme';
import { Gear, GearKind } from '../types';

export default function StatsScreen() {
  const { workouts, settings, gear } = useStore();
  const [today] = useState(() => new Date());
  const [weeks, setWeeks] = useState<6 | 12 | 26>(12);
  const [editingGear, setEditingGear] = useState<Gear | 'new' | null>(null);
  const units = settings.units;

  const volume = useMemo(() => weeklyVolume(workouts, today, weeks), [workouts, today, weeks]);
  const load = useMemo(() => loadSeries(workouts, settings, today, 90), [workouts, settings, today]);
  const bests = useMemo(() => personalBests(workouts), [workouts]);
  const all = useMemo(() => totals(workouts), [workouts]);
  const latest = load[load.length - 1];
  const avgWeek = volume.reduce((s, w) => s + w.totalSec, 0) / Math.max(1, volume.length);

  if (workouts.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.content}>
          <Text style={type.title}>Stats</Text>
          <EmptyState icon="chart-bar" title="No stats yet" body="Charts, personal bests and your fitness trend appear here once you've logged a few workouts. You can try it out with sample data from Settings on the Today tab." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.title}>Stats</Text>

        <SectionTitle>Weekly training</SectionTitle>
        <Card>
          <Segmented
            options={[
              { value: 6, label: '6 weeks' },
              { value: 12, label: '12 weeks' },
              { value: 26, label: '6 months' },
            ]}
            value={weeks}
            onChange={setWeeks}
          />
          <WeeklyBars weeks={volume} targetMin={settings.weeklyTargetMin} />
          <Text style={type.small}>
            Average {formatHours(avgWeek)} a week · target {formatHours(settings.weeklyTargetMin * 60)}
          </Text>
        </Card>

        {latest ? (
          <>
            <SectionTitle>Fitness and form (90 days)</SectionTitle>
            <Card>
              <View style={styles.row}>
                <Stat label="Fitness" value={String(Math.round(latest.fitness))} />
                <Stat label="Fatigue" value={String(Math.round(latest.fatigue))} />
                <Stat label="Form" value={`${latest.form > 0 ? '+' : ''}${Math.round(latest.form)}`} sub={describeForm(latest.form).label} />
              </View>
              <LoadChart series={load} />
              <Text style={type.small}>
                Fitness is your training load averaged over six weeks; fatigue over one week. Form is the difference: positive means fresh, negative means you are carrying fatigue.
                {settings.maxHr ? ' Workouts with heart rate are scored from it.' : ' Workouts are scored from your effort rating; add your max heart rate in Settings to use heart rate instead.'}
              </Text>
            </Card>
          </>
        ) : null}

        {bests.length > 0 ? (
          <>
            <SectionTitle>Personal bests</SectionTitle>
            <Card>
              {bests.map((b) => (
                <View key={b.label} style={styles.best}>
                  <SportBadge sport={b.sport} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{b.label}</Text>
                    <Text style={type.small}>{formatDate(new Date(b.date))}</Text>
                  </View>
                  <Text style={[type.heading, styles.tabular]}>{b.kind === 'distance' ? formatSportDistance(b.sport, b.value, units) : formatDuration(b.value)}</Text>
                </View>
              ))}
              <Text style={type.small}>Times are worked out from the average pace of a session at least that long.</Text>
            </Card>
          </>
        ) : null}

        <SectionTitle>All time</SectionTitle>
        <Card>
          <View style={styles.row}>
            <Stat label="Sessions" value={String(all.sessions)} />
            <Stat label="Time" value={formatHours(all.durationSec)} />
            <Stat label="Distance" value={formatDistance(all.distanceM, units)} />
          </View>
          {VOLUME_SPORTS.filter((s) => all.bySport[s].sessions > 0).map((s) => (
            <View key={s} style={styles.best}>
              <SportBadge sport={s} size={30} />
              <Text style={[type.body, { flex: 1 }]}>
                {all.bySport[s].sessions} {all.bySport[s].sessions === 1 ? 'session' : 'sessions'}
              </Text>
              <Text style={[type.small, styles.tabular]}>{formatHours(all.bySport[s].durationSec)}</Text>
              {s !== 'strength' ? <Text style={[type.body, styles.tabular, { width: 92, textAlign: 'right' }]}>{formatSportDistance(s, all.bySport[s].distanceM, units)}</Text> : <View style={{ width: 92 }} />}
            </View>
          ))}
        </Card>

        <SectionTitle action={<Button label="Add gear" variant="quiet" icon="plus" onPress={() => setEditingGear('new')} />}>Gear</SectionTitle>
        {gear.length === 0 ? (
          <Text style={type.small}>Track how far your shoes and bikes have gone, with a warning when shoes are due for replacing.</Text>
        ) : (
          gear.map((g) => {
            const w = wear(g, workouts);
            const color = w.status === 'replace' ? colors.danger : w.status === 'soon' ? colors.warning : colors.success;
            return (
              <Card key={g.id} onPress={() => setEditingGear(g)} style={g.retired ? { opacity: 0.6 } : undefined}>
                <View style={styles.gearTop}>
                  <Text style={[type.heading, { flex: 1 }]}>{g.name}</Text>
                  <Text style={type.small}>{g.retired ? 'Retired' : GEAR_LABELS[g.kind]}</Text>
                </View>
                <Text style={[type.body, styles.tabular]}>
                  {formatDistance(w.distanceM, units)}
                  {g.limitM ? ` of ${formatDistance(g.limitM, units)}` : ''}
                </Text>
                {w.fraction !== null ? <ProgressBar value={w.fraction} color={color} /> : null}
                {w.status !== 'ok' && !g.retired ? (
                  <Text style={[type.small, { color }]}>{w.status === 'replace' ? 'Past its recommended distance: time for a new pair.' : 'Getting close to its recommended distance.'}</Text>
                ) : null}
              </Card>
            );
          })
        )}

        {settings.maxHr ? (
          <>
            <SectionTitle>Heart-rate zones</SectionTitle>
            <Card>
              {hrZones(settings.maxHr, settings.restingHr).map((z, i) => (
                <View key={z.zone} style={styles.best}>
                  <View style={[styles.zoneSwatch, { backgroundColor: [sportColors.swim, sportColors.run, sportColors.bike, sportColors.brick, colors.danger][i] }]} />
                  <Text style={[type.body, { flex: 1 }]}>
                    Zone {z.zone} · {z.name}
                  </Text>
                  <Text style={[type.body, styles.tabular]}>
                    {z.min}–{z.max} bpm
                  </Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      {editingGear && <GearForm gear={editingGear === 'new' ? undefined : editingGear} onClose={() => setEditingGear(null)} />}
    </SafeAreaView>
  );
}

const KINDS: GearKind[] = ['shoes', 'bike', 'wetsuit', 'other'];

function GearForm({ gear, onClose }: { gear?: Gear; onClose: () => void }) {
  const { settings, saveGear, deleteGear } = useStore();
  const units = settings.units;
  const inUnits = (m?: number) => (m ? String(Math.round(m / (units === 'imperial' ? 1609.344 : 1000))) : '');
  const [name, setName] = useState(gear?.name ?? '');
  const [kind, setKind] = useState<GearKind>(gear?.kind ?? 'shoes');
  const [start, setStart] = useState(inUnits(gear?.startDistanceM) || '0');
  const [limit, setLimit] = useState(gear ? inUnits(gear.limitM) : inUnits(DEFAULT_LIMITS.shoes));
  const [tried, setTried] = useState(false);
  const unit = units === 'imperial' ? 'mi' : 'km';
  const startM = parseDistance(start || '0', 'run', units);
  const limitM = limit.trim() ? parseDistance(limit, 'run', units) : undefined;
  const error = !name.trim() ? 'Give it a name' : startM === null || limitM === null ? 'Distances must be numbers' : null;

  const pickKind = (k: GearKind) => {
    setKind(k);
    if (!gear) setLimit(inUnits(DEFAULT_LIMITS[k]));
  };

  const save = (changes: Partial<Gear> = {}) => {
    setTried(true);
    if (error) return;
    saveGear({ id: gear?.id ?? newId(), name: name.trim(), kind, startDistanceM: startM!, limitM: limitM || undefined, retired: gear?.retired, ...changes });
    onClose();
  };

  const remove = () =>
    Alert.alert(`Delete ${gear?.name}?`, 'Workouts that used it are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteGear(gear!.id);
          onClose();
        },
      },
    ]);

  return (
    <FormModal title={gear ? 'Edit gear' : 'Add gear'} onClose={onClose}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Pegasus 41" error={tried ? (name.trim() ? null : error) : null} />
      <Text style={type.label}>Type</Text>
      <View style={styles.wrap}>
        {KINDS.map((k) => (
          <Chip key={k} label={GEAR_LABELS[k]} selected={kind === k} onPress={() => pickKind(k)} />
        ))}
      </View>
      <Field label={`Distance already on it (${unit})`} value={start} onChangeText={setStart} keyboardType="decimal-pad" />
      <Field
        label={`Replace after (${unit})`}
        value={limit}
        onChangeText={setLimit}
        keyboardType="decimal-pad"
        placeholder="Leave blank for no limit"
        hint={kind === 'shoes' ? 'Running shoes usually last 500 to 800 km.' : undefined}
        error={tried && name.trim() ? error : null}
      />
      <Text style={type.small}>Choose this gear when you log or save a workout, and its distance is added here.</Text>
      <Button label="Save" onPress={() => save()} big />
      {gear ? (
        <>
          <Button label={gear.retired ? 'Bring out of retirement' : 'Retire'} variant="outline" onPress={() => save({ retired: !gear.retired })} />
          <Button label="Delete" variant="danger" icon="trash-can-outline" onPress={remove} />
        </>
      ) : null}
    </FormModal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md },
  best: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  gearTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneSwatch: { width: 14, height: 14, borderRadius: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
