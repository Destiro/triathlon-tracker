import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colorOf, SPORT_LABELS, tintOf } from '../../components/sport';
import { Card } from '../../components/ui';
import { plannedAmount } from '../../components/WorkoutCard';
import { daysBetween, fromKey } from '../../dates';
import { formatClock, formatDistance, formatHoursMinutes, formatRunPace, formatSpeed, formatSwimPace } from '../../format';
import { Confidence, LegPrediction, predictRace } from '../../prediction';
import { daysOfWeek, PHASE_LABELS, TOTAL_WEEKS } from '../../plan/schedule';
import { Phase, Sport } from '../../plan/types';
import { useStore, useTodayKey } from '../../store';
import { colors, radius, spacing, sportColors, type } from '../../theme';

const CONFIDENCE: Record<Confidence, { label: string; color: string }> = {
  rough: { label: 'Rough estimate: only one recent session on a leg', color: colors.warning },
  fair: { label: 'Fair estimate', color: colors.inkSoft },
  good: { label: 'Good estimate: four or more recent sessions on every leg', color: colors.success },
};

/** One leg of the predicted race: its time and pace or speed, and what it is based on. */
function PredictedLeg({ leg }: { leg: LegPrediction }) {
  const pace = leg.speed === null ? '' : leg.sport === 'swim' ? formatSwimPace(leg.speed) : leg.sport === 'bike' ? formatSpeed(leg.speed) : formatRunPace(leg.speed);
  return (
    <View style={[styles.leg, styles.predictedLeg, { borderLeftColor: colorOf(leg.sport), backgroundColor: tintOf(leg.sport) }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body}>
          {SPORT_LABELS[leg.sport]}
          {pace ? ` · ${pace}` : ''}
        </Text>
        <Text style={leg.seconds === null ? styles.missing : type.small}>{leg.basedOn}</Text>
      </View>
      <Text style={styles.legAmount}>{leg.seconds === null ? '–' : formatClock(leg.seconds)}</Text>
    </View>
  );
}

const PHASE_COLORS: Record<Phase, string> = {
  base: colors.inkFaint,
  build: colors.accent,
  peak: sportColors.brick,
  taper: sportColors.run,
  race: sportColors.race,
};

export default function RaceScreen() {
  const { settings, schedule, activities } = useStore();
  const todayKey = useTodayKey();
  const daysToGo = daysBetween(fromKey(todayKey), fromKey(settings.raceDate));
  const currentWeek = schedule.get(todayKey)?.week ?? (todayKey < settings.planStart ? 0 : TOTAL_WEEKS + 1);
  const race = schedule.get(settings.raceDate)?.workouts.find((w) => w.kind === 'race');
  const legs = race?.legs ?? [];
  const totalM = legs.reduce((sum, l) => sum + (l.metres ?? 0), 0);
  const metres = (sport: Sport, fallback: number) => legs.find((l) => l.sport === sport)?.metres ?? fallback;
  const prediction = predictRace(activities, todayKey, { swim: metres('swim', 1900), bike: metres('bike', 90000), run: metres('run', 21100) });

  const weeks = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => ({ week: w, phase: daysOfWeek(schedule, w)[0]?.phase ?? 'base' }));
  const raceWeek = daysOfWeek(schedule, TOTAL_WEEKS);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.list}>
        <View>
          <Text style={type.small}>{fromKey(settings.raceDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          <Text style={type.title}>{settings.raceName}</Text>
        </View>

        <Card style={styles.countdown}>
          {daysToGo > 0 ? (
            <>
              <Text style={styles.big}>{daysToGo}</Text>
              <Text style={type.body}>{daysToGo === 1 ? 'day to go' : 'days to go'}</Text>
              <Text style={type.small}>
                {Math.floor(daysToGo / 7)} weeks and {daysToGo % 7} days
                {currentWeek >= 1 && currentWeek <= TOTAL_WEEKS ? ` · you're in week ${currentWeek} of ${TOTAL_WEEKS}` : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.big}>{daysToGo === 0 ? 'Race day' : 'Done'}</Text>
          )}
        </Card>

        {daysToGo > 0 && (
          <Card title="Predicted finish">
            {prediction.total !== null ? (
              <View style={styles.predicted}>
                <Text style={styles.big}>{formatHoursMinutes(prediction.total)}</Text>
                <Text style={type.body}>
                  Likely between {formatHoursMinutes(prediction.low!)} and {formatHoursMinutes(prediction.high!)}
                </Text>
                <Text style={[styles.confidence, { color: CONFIDENCE[prediction.confidence!].color }]}>{CONFIDENCE[prediction.confidence!].label}</Text>
              </View>
            ) : (
              <Text style={type.body}>Not enough recent training to predict a finish yet. Each leg needs a long enough session in the last 6 weeks.</Text>
            )}

            <PredictedLeg leg={prediction.swim} />
            <Text style={styles.transition}>T1 · {formatClock(prediction.t1)} (assumed)</Text>
            <PredictedLeg leg={prediction.bike} />
            <Text style={styles.transition}>T2 · {formatClock(prediction.t2)} (assumed)</Text>
            <PredictedLeg leg={prediction.run} />

            <Text style={type.small}>
              An estimate from your last 6 weeks of training. It reads slow early in the plan and tightens as your sessions get longer. Race-day effort, the
              course, the weather and a wetsuit are not in it.
            </Text>
          </Card>
        )}

        {legs.length > 0 && (
          <Card title="The course" note={`${formatDistance(totalM)} in all`}>
            {legs.map((l) => (
              <View key={l.sport} style={[styles.leg, { borderLeftColor: colorOf(l.sport), backgroundColor: tintOf(l.sport) }]}>
                <Text style={type.body}>{SPORT_LABELS[l.sport]}</Text>
                <Text style={styles.legAmount}>{`${(l.metres ?? 0) / 1000} km`}</Text>
              </View>
            ))}
          </Card>
        )}

        <Card title="The road there" note="Each block is a week. Faded ones are still to come.">
          <View style={styles.weeks}>
            {weeks.map(({ week, phase }) => (
              <View
                key={week}
                style={[
                  styles.week,
                  { backgroundColor: PHASE_COLORS[phase], opacity: week <= currentWeek ? 1 : 0.35 },
                  week === currentWeek && styles.weekNow,
                ]}
                accessibilityLabel={`Week ${week}, ${PHASE_LABELS[phase]}${week === currentWeek ? ', this week' : ''}`}
              />
            ))}
          </View>
          <View style={styles.legend}>
            {(Object.keys(PHASE_COLORS) as Phase[]).map((p) => (
              <View key={p} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: PHASE_COLORS[p] }]} />
                <Text style={type.small}>{PHASE_LABELS[p]}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card title="Race week" note="Tap a day to see the workout.">
          {raceWeek.map((d) => (
            <Pressable key={d.date} style={styles.day} onPress={() => router.push({ pathname: '/day/[date]', params: { date: d.date } })}>
              <Text style={styles.dayName}>{fromKey(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</Text>
              <View style={styles.dayWorkouts}>
                {d.workouts.length === 0 ? (
                  <Text style={type.small}>Rest</Text>
                ) : (
                  d.workouts.map((w, i) => (
                    <View key={i} style={[styles.tag, { borderLeftColor: colorOf(w.kind), backgroundColor: tintOf(w.kind) }]}>
                      <Text style={styles.tagText}>
                        {w.kind === 'race' ? 'Race' : w.title}
                        {w.kind !== 'race' && plannedAmount(w) ? ` · ${plannedAmount(w)}` : ''}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </Pressable>
          ))}
        </Card>
        <View style={{ height: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  countdown: { alignItems: 'center', paddingVertical: spacing.xl },
  big: { ...type.hero, fontSize: 64, lineHeight: 72 },
  leg: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 5, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  predicted: { alignItems: 'center', gap: 2, paddingVertical: spacing.sm },
  confidence: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  predictedLeg: { alignItems: 'flex-start' },
  transition: { fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
  missing: { fontSize: 13, color: colors.warning },
  legAmount: { ...type.number, fontSize: 18 },
  weeks: { flexDirection: 'row', gap: 3, alignItems: 'center', height: 30 },
  week: { flex: 1, height: 20, borderRadius: 3 },
  weekNow: { height: 30, borderWidth: 2, borderColor: colors.ink },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  day: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  dayName: { width: 56, fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  dayWorkouts: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderLeftWidth: 3, borderRadius: 5, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { fontSize: 13, color: colors.ink },
});
