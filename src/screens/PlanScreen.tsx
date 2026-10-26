import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageModal, FormModal } from '../components/modals';
import { RaceCard, RaceDetail, RaceForm } from '../components/races';
import { Button, Card, Chip, EmptyState, ProgressBar, SectionTitle, Segmented, SportBadge } from '../components/ui';
import { WorkoutForm } from '../components/workouts';
import { daysBetween, formatDate, formatDay, fromKey, startOfWeek, toKey } from '../lib/dates';
import { formatHours, relativeDays, sportLabel } from '../lib/format';
import { generatePlan, PHASE_LABELS, plannedMinutes, planProgress, SessionStatus, sessionStatus, weekContaining } from '../lib/plan';
import { daysUntil, raceLabel } from '../lib/races';
import { TabParams } from '../navigation';
import { useStore } from '../store';
import { colors, radius, spacing, sportColors, type } from '../theme';
import { Phase, PlanSession, Race, Sport } from '../types';

const PHASE_COLORS: Record<Phase, string> = {
  base: '#0EA5E9',
  build: '#F59E0B',
  peak: '#EA580C',
  taper: '#16A34A',
  race: '#DC2626',
};

/** The activity on the Track tab that suits a planned session. */
export const activityFor = (session: PlanSession): string =>
  session.sport === 'race' ? 'tri' : session.sport === 'rest' ? 'run' : session.sport;

const STATUS_ICONS: Record<SessionStatus, { icon: string; color: string; label: string }> = {
  done: { icon: 'check-circle', color: colors.success, label: 'Done' },
  missed: { icon: 'close-circle-outline', color: colors.danger, label: 'Missed' },
  today: { icon: 'circle-slice-4', color: colors.accent, label: 'Today' },
  upcoming: { icon: 'circle-outline', color: colors.inkSoft, label: 'Upcoming' },
  rest: { icon: 'sleep', color: colors.inkSoft, label: 'Rest' },
};

export default function PlanScreen() {
  const { races, plan, workouts } = useStore();
  const [tab, setTab] = useState<'plan' | 'races'>(plan ? 'plan' : 'races');
  const [addingRace, setAddingRace] = useState(false);
  const [openRaceId, setOpenRaceId] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState<Race | null>(null);
  const [today] = useState(() => new Date());

  const sortedRaces = useMemo(() => {
    const upcoming = races.filter((r) => daysUntil(r, today) >= 0).sort((a, b) => a.date.localeCompare(b.date));
    const past = races.filter((r) => daysUntil(r, today) < 0).sort((a, b) => b.date.localeCompare(a.date));
    return { upcoming, past };
  }, [races, today]);
  const openRace = races.find((r) => r.id === openRaceId) ?? null;

  const startPlan = (race: Race) => {
    setOpenRaceId(null);
    if (plan?.raceId === race.id) setTab('plan');
    else setPlanFor(race);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={type.title}>Plan</Text>
        <Segmented
          options={[
            { value: 'plan', label: 'Training plan' },
            { value: 'races', label: `Races${races.length ? ` (${races.length})` : ''}` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'races' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Button label="Add a race" icon="plus" onPress={() => setAddingRace(true)} />
          {races.length === 0 ? (
            <EmptyState icon="flag-checkered" title="No races yet" body="Add the race you're training for to get a countdown, a predicted finish time and a training plan built around it." />
          ) : null}
          {sortedRaces.upcoming.length > 0 ? <SectionTitle>Upcoming</SectionTitle> : null}
          {sortedRaces.upcoming.map((r) => (
            <RaceCard key={r.id} race={r} onPress={() => setOpenRaceId(r.id)} />
          ))}
          {sortedRaces.past.length > 0 ? <SectionTitle>Past</SectionTitle> : null}
          {sortedRaces.past.map((r) => (
            <RaceCard key={r.id} race={r} onPress={() => setOpenRaceId(r.id)} />
          ))}
        </ScrollView>
      ) : plan ? (
        <PlanView today={today} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <EmptyState
            icon="calendar-blank-outline"
            title="No training plan yet"
            body={
              sortedRaces.upcoming.length
                ? 'Build a week-by-week plan for your next race. It ramps up through base, build and peak phases, then tapers so you arrive fresh.'
                : 'First add the race you are training for, then a plan can be built around it.'
            }
            action={
              sortedRaces.upcoming.length ? (
                <Button label={`Build a plan for ${sortedRaces.upcoming[0].name}`} icon="calendar-plus" onPress={() => setPlanFor(sortedRaces.upcoming[0])} />
              ) : (
                <Button label="Add a race" icon="plus" onPress={() => setAddingRace(true)} />
              )
            }
          />
          {workouts.length === 0 ? null : <Text style={[type.small, { textAlign: 'center' }]}>Sessions are ticked off automatically when you log a matching workout.</Text>}
        </ScrollView>
      )}

      {addingRace && <RaceForm onClose={() => setAddingRace(false)} onSaved={() => setTab('races')} />}
      {openRace && <RaceDetail race={openRace} onClose={() => setOpenRaceId(null)} onPlan={() => startPlan(openRace)} />}
      {planFor && (
        <PlanSetup
          race={planFor}
          onClose={() => setPlanFor(null)}
          onCreated={() => {
            setPlanFor(null);
            setTab('plan');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function PlanView({ today }: { today: Date }) {
  const { plan, races, workouts, setPlan } = useStore();
  const navigation = useNavigation<NavigationProp<TabParams>>();
  const [showPast, setShowPast] = useState(false);
  const [open, setOpen] = useState<PlanSession | null>(null);
  const [logging, setLogging] = useState<PlanSession | null>(null);
  if (!plan) return null;

  const race = races.find((r) => r.id === plan.raceId);
  const progress = planProgress(plan, workouts, today);
  const current = weekContaining(plan, today);
  const thisWeekKey = toKey(startOfWeek(today));
  const weeks = showPast ? plan.weeks : plan.weeks.filter((w) => w.startDate >= thisWeekKey);
  const hiddenWeeks = plan.weeks.length - weeks.length;

  const confirmDelete = () =>
    Alert.alert('Delete this plan?', 'Your logged workouts are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete plan', style: 'destructive', onPress: () => setPlan(null) },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <Text style={type.label}>Training for</Text>
        <Text style={type.heading}>{race ? `${race.name} · ${raceLabel(race)}` : 'Your race'}</Text>
        {race ? (
          <Text style={type.small}>
            {formatDate(fromKey(race.date))} · {relativeDays(daysUntil(race, today))} · {plan.weeklyHours} h/week at peak
          </Text>
        ) : null}
        <View style={styles.progressRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={progress.due ? progress.done / progress.due : 0} color={colors.success} />
          </View>
          <Text style={type.small}>
            {progress.done}/{progress.due} done so far
          </Text>
        </View>
        {current ? (
          <Text style={type.body}>
            This is week {current.index + 1} of {plan.weeks.length}: <Text style={{ fontWeight: '700', color: PHASE_COLORS[current.phase] }}>{PHASE_LABELS[current.phase]}</Text>
            {current.recovery ? ' (recovery week)' : ''}.
          </Text>
        ) : null}
      </Card>

      {hiddenWeeks > 0 ? (
        <Pressable onPress={() => setShowPast(!showPast)} style={{ alignSelf: 'center' }} accessibilityRole="button">
          <Text style={styles.link}>{showPast ? 'Hide past weeks' : `Show ${hiddenWeeks} past ${hiddenWeeks === 1 ? 'week' : 'weeks'}`}</Text>
        </Pressable>
      ) : showPast && plan.weeks.some((w) => w.startDate < thisWeekKey) ? (
        <Pressable onPress={() => setShowPast(false)} style={{ alignSelf: 'center' }} accessibilityRole="button">
          <Text style={styles.link}>Hide past weeks</Text>
        </Pressable>
      ) : null}

      {weeks.map((week) => (
        <View key={week.index} style={[styles.week, week.startDate === thisWeekKey && styles.weekCurrent]}>
          <View style={styles.weekHeader}>
            <View style={[styles.phase, { backgroundColor: PHASE_COLORS[week.phase] }]}>
              <Text style={styles.phaseText}>{PHASE_LABELS[week.phase]}</Text>
            </View>
            <Text style={[type.heading, { flex: 1 }]}>Week {week.index + 1}</Text>
            <Text style={type.small}>
              {formatDate(fromKey(week.startDate)).replace(/ \d{4}$/, '')} · {formatHours(plannedMinutes(week) * 60)}
            </Text>
          </View>
          {week.recovery ? <Text style={styles.recovery}>Recovery week: lighter, so your body can absorb the training.</Text> : null}
          {week.sessions.map((s) => {
            const status = sessionStatus(s, workouts, today);
            const si = STATUS_ICONS[status];
            return (
              <Pressable key={s.id} onPress={() => setOpen(s)} style={({ pressed }) => [styles.session, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`${formatDay(fromKey(s.date))}, ${s.title}, ${si.label}`}>
                <Text style={[type.small, styles.day]}>{formatDay(fromKey(s.date)).split(' ')[0]}</Text>
                <SportBadge sport={s.sport} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, status === 'done' && { color: colors.inkSoft }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  {s.durationMin > 0 ? <Text style={type.small}>{formatHours(s.durationMin * 60)}</Text> : null}
                </View>
                <MaterialCommunityIcons name={si.icon as never} size={22} color={si.color} />
              </Pressable>
            );
          })}
        </View>
      ))}

      <Button label="Delete plan" variant="outline" icon="trash-can-outline" onPress={confirmDelete} />

      {open && (
        <SessionDetail
          session={open}
          status={sessionStatus(open, workouts, today)}
          onClose={() => setOpen(null)}
          onStart={() => {
            const activity = activityFor(open);
            setOpen(null);
            navigation.navigate('Track', { activity, at: Date.now() });
          }}
          onLog={() => {
            setLogging(open);
            setOpen(null);
          }}
        />
      )}
      {logging && (
        <WorkoutForm
          sport={(['swim', 'bike', 'run', 'strength'].includes(logging.sport) ? logging.sport : 'bike') as Sport}
          heading={`Log: ${logging.title}`}
          onClose={() => setLogging(null)}
        />
      )}
    </ScrollView>
  );
}

function SessionDetail({ session, status, onClose, onStart, onLog }: { session: PlanSession; status: SessionStatus; onClose: () => void; onStart: () => void; onLog: () => void }) {
  const [today] = useState(() => new Date());
  const days = daysBetween(today, fromKey(session.date));
  return (
    <PageModal title={session.title} onClose={onClose}>
      <View style={styles.sessionTop}>
        <SportBadge sport={session.sport} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>{session.title}</Text>
          <Text style={type.small}>
            {formatDay(fromKey(session.date))} · {relativeDays(days)}
            {session.durationMin > 0 ? ` · ${formatHours(session.durationMin * 60)}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.tags}>
        <Chip label={sportLabel(session.sport)} selected onPress={() => {}} color={sportColors[session.sport]} />
        {session.intensity !== 'rest' ? <Chip label={session.intensity[0].toUpperCase() + session.intensity.slice(1)} selected={false} onPress={() => {}} /> : null}
        <Chip label={STATUS_ICONS[status].label} selected={false} onPress={() => {}} icon={STATUS_ICONS[status].icon} />
      </View>
      <Card>
        <Text style={type.label}>The session</Text>
        <Text style={[type.body, { lineHeight: 22 }]}>{session.description}</Text>
      </Card>
      {session.sport !== 'rest' && status !== 'done' ? (
        <>
          <Button label="Start this workout" icon="play" onPress={onStart} big />
          <Button label="I did it: log it" variant="quiet" icon="pencil-plus" onPress={onLog} />
        </>
      ) : null}
      {status === 'done' ? <Text style={[type.body, { color: colors.success }]}>Done. Nice work!</Text> : null}
    </PageModal>
  );
}

const HOURS = [4, 6, 8, 10, 12, 15];

function PlanSetup({ race, onClose, onCreated }: { race: Race; onClose: () => void; onCreated: () => void }) {
  const { plan, setPlan } = useStore();
  const suggested = race.distance === 'sprint' ? 6 : race.distance === 'olympic' ? 8 : race.distance === 'half' ? 10 : race.distance === 'full' ? 12 : 8;
  const [hours, setHours] = useState(suggested);
  const [strength, setStrength] = useState(suggested >= 6);
  const [today] = useState(() => new Date());
  const preview = useMemo(() => generatePlan({ race, weeklyHours: hours, today, strength }), [race, hours, today, strength]);

  const create = () => {
    if (!preview) return;
    const go = () => {
      setPlan(preview);
      onCreated();
    };
    if (plan) {
      Alert.alert('Replace your current plan?', 'Your logged workouts are kept.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: go },
      ]);
    } else go();
  };

  const phases = preview ? preview.weeks.map((w) => w.phase) : [];
  const count = (p: Phase) => phases.filter((x) => x === p).length;

  return (
    <FormModal title="Build a training plan" onClose={onClose}>
      <Text style={type.heading}>{race.name}</Text>
      <Text style={type.small}>
        {raceLabel(race)} · {formatDate(fromKey(race.date))}
      </Text>

      <Text style={type.label}>Hours a week at your busiest</Text>
      <View style={styles.tags}>
        {HOURS.map((h) => (
          <Chip key={h} label={`${h} h`} selected={hours === h} onPress={() => setHours(h)} />
        ))}
      </View>
      <Text style={type.small}>Suggested for this distance: {suggested} h. Earlier weeks start lighter and build up to this.</Text>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.body}>Include strength training</Text>
          <Text style={type.small}>One gym or core session a week in base and build.</Text>
        </View>
        <Switch value={strength} onValueChange={setStrength} trackColor={{ true: colors.accent }} />
      </View>

      {preview ? (
        <Card>
          <Text style={type.heading}>{preview.weeks.length} weeks</Text>
          <View style={styles.phaseBar}>
            {preview.weeks.map((w) => (
              <View key={w.index} style={{ flex: 1, height: 14, backgroundColor: PHASE_COLORS[w.phase], opacity: w.recovery ? 0.5 : 1 }} />
            ))}
          </View>
          <View style={styles.tags}>
            {(['base', 'build', 'peak', 'taper', 'race'] as Phase[])
              .filter((p) => count(p) > 0)
              .map((p) => (
                <Text key={p} style={type.small}>
                  <Text style={{ color: PHASE_COLORS[p], fontWeight: '700' }}>■ </Text>
                  {PHASE_LABELS[p]} {count(p)}
                </Text>
              ))}
          </View>
          <Text style={type.small}>Six sessions a week with a rest day on Mondays, long sessions at the weekend, and bricks once you reach the build phase.</Text>
        </Card>
      ) : (
        <Text style={[type.body, { color: colors.danger }]}>This race has already happened, so there is nothing to plan.</Text>
      )}
      <Button label="Create plan" icon="check" onPress={create} disabled={!preview} big />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  link: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  week: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  weekCurrent: { borderColor: colors.accent, borderWidth: 2 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  phase: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  phaseText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  recovery: { fontSize: 13, color: colors.inkSoft, fontStyle: 'italic' },
  session: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  day: { width: 32 },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  phaseBar: { flexDirection: 'row', gap: 2, borderRadius: 4, overflow: 'hidden' },
});
