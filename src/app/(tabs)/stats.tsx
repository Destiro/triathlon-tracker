import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, LineChart } from '../../components/charts';
import { colorOf, SPORT_LABELS, SportBadge, tintOf } from '../../components/sport';
import { Card, Empty } from '../../components/ui';
import { addDays, fromKey, toKey } from '../../dates';
import { formatClock, formatDistance, formatMinutes, formatRunPace, formatSpeed, formatSwimPace } from '../../format';
import { TOTAL_WEEKS } from '../../plan/schedule';
import { efficiency, highestHeartRate, loadSeries, records, SPORTS, totals, unitOf, weekVolume } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, spacing, type } from '../../theme';

const CURVE_DAYS = 120;
const FATIGUE_COLOR = '#A78BFA';

const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function StatsScreen() {
  const { schedule, activities, activitiesByDate, settings } = useStore();
  const todayKey = useTodayKey();
  const currentWeek = Math.min(schedule.get(todayKey)?.week ?? (todayKey < settings.planStart ? 1 : TOTAL_WEEKS), TOTAL_WEEKS);

  if (activities.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.list}>
          <Text style={type.title}>Stats</Text>
          <Empty text="Connect Strava in Settings and your workouts will fill in the charts here." />
        </View>
      </SafeAreaView>
    );
  }

  const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const volumes = weeks.map((w) => weekVolume(schedule, activitiesByDate, w));

  const hr = { maxHr: Math.max(settings.maxHr, highestHeartRate(activities)), restHr: settings.restHr };
  const curveStart = toKey(addDays(fromKey(todayKey), -CURVE_DAYS));
  const firstActivity = activities[activities.length - 1].date;
  const series = loadSeries(activities, firstActivity > curveStart ? firstActivity : curveStart, todayKey, hr);
  const now = series[series.length - 1];
  const labels = series.map((p) => shortDate(p.date));

  const runEff = efficiency(activities, 'run');
  const bikeEff = efficiency(activities, 'bike');
  const sinceStart = totals(activities, settings.planStart);
  const best = records(activities, settings.planStart);

  const formState =
    now.form > 5 ? 'Fresh: well rested.' : now.form > -10 ? 'Balanced: absorbing the training.' : now.form > -25 ? 'Tired: normal in a hard block.' : 'Very tired: watch for overreaching.';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={type.title}>Stats</Text>

        {SPORTS.map((s) => (
          <Card key={s}>
            <View style={styles.titleRow}>
              <SportBadge kind={s} size={28} />
              <Text style={type.heading}>{SPORT_LABELS[s]} per week</Text>
            </View>
            <Text style={type.small}>Faded bar: planned. Solid bar: done.</Text>
            <BarChart
              color={colorOf(s)}
              tint={tintOf(s)}
              format={(v) => (unitOf(s) === 'metres' ? `${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k` : `${(v / 60).toFixed(v % 60 ? 1 : 0)}h`)}
              groups={weeks.map((w, i) => ({
                label: `${w}`,
                planned: volumes[i][s].planned,
                actual: volumes[i][s].actual,
                highlight: w === currentWeek,
              }))}
            />
            <Text style={type.small}>Weeks of the plan along the bottom.</Text>
          </Card>
        ))}

        <Card>
          <Text style={type.heading}>Fitness and fatigue</Text>
          <Text style={type.small}>Training load from heart rate. Fitness builds slowly; fatigue rises and falls with each week.</Text>
          <LineChart
            labels={labels}
            series={[
              { label: 'Fitness', color: colors.accent, values: series.map((p) => p.fitness) },
              { label: 'Fatigue', color: FATIGUE_COLOR, values: series.map((p) => p.fatigue), dashed: true },
            ]}
          />
          <Text style={type.body}>
            Fitness {Math.round(now.fitness)} · Fatigue {Math.round(now.fatigue)} · Form {Math.round(now.form)}
          </Text>
          <Text style={type.small}>{formState}</Text>
        </Card>

        <Card>
          <Text style={type.heading}>Form</Text>
          <Text style={type.small}>Fitness minus fatigue. It should climb back above zero during the taper.</Text>
          <LineChart labels={labels} zeroLine series={[{ label: 'Form', color: colors.accent, values: series.map((p) => p.form) }]} />
        </Card>

        {[
          { sport: 'run' as const, points: runEff, text: 'Metres per heartbeat on runs over 20 minutes. Rising means the same effort takes you further.' },
          { sport: 'bike' as const, points: bikeEff, text: 'Metres per heartbeat on rides over 20 minutes. Rising means the same effort takes you further.' },
        ].map(({ sport, points, text }) =>
          points.length >= 3 ? (
            <Card key={sport}>
              <View style={styles.titleRow}>
                <SportBadge kind={sport} size={28} />
                <Text style={type.heading}>{SPORT_LABELS[sport]} efficiency</Text>
              </View>
              <Text style={type.small}>{text}</Text>
              <LineChart
                labels={points.map((p) => shortDate(p.date))}
                format={(v) => v.toFixed(2)}
                series={[{ label: SPORT_LABELS[sport], color: colorOf(sport), values: points.map((p) => p.value) }]}
              />
            </Card>
          ) : null,
        )}

        <Card>
          <Text style={type.heading}>Totals since the plan began</Text>
          {[...SPORTS, 'gym' as const].map((s) => {
            const t = sinceStart[s];
            if (s === 'gym' && t.count === 0) return null;
            return (
              <View key={s} style={styles.totalRow}>
                <SportBadge kind={s} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>
                    {SPORT_LABELS[s]} · {t.count} {t.count === 1 ? 'session' : 'sessions'}
                  </Text>
                  <Text style={type.small}>
                    {s === 'gym' ? '' : `${formatDistance(t.distanceM, s === 'swim')} · `}
                    {formatMinutes(t.movingS / 60)}
                    {s === 'bike' && t.elevationM ? ` · ${Math.round(t.elevationM).toLocaleString()} m climbing` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>

        {best.length > 0 && (
          <Card>
            <Text style={type.heading}>Best efforts</Text>
            {best.map((b) => (
              <View key={b.label} style={styles.totalRow}>
                <SportBadge kind={b.sport} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{b.label}</Text>
                  <Text style={type.small}>
                    {b.label.includes('pace') || b.label.startsWith('Fastest')
                      ? `${b.sport === 'swim' ? formatSwimPace(b.activity.avgSpeed) : b.sport === 'run' ? formatRunPace(b.activity.avgSpeed) : formatSpeed(b.activity.avgSpeed)} · `
                      : b.label === 'Most climbing'
                        ? `${Math.round(b.activity.elevationM)} m · `
                        : `${formatDistance(b.activity.distanceM, b.sport === 'swim')} · `}
                    {formatClock(b.activity.movingS)} · {shortDate(b.activity.date)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}
        <View style={{ height: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
});
