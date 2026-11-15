import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bestValue } from '../../bests';
import { BarChart, LineChart } from '../../components/charts';
import { colorOf, SPORT_LABELS, SportBadge, tintOf } from '../../components/sport';
import { DriftCard, EnergyCard, MonthCard, ZonesByWeek } from '../../components/StatsCards';
import { Card, Chips, Empty, Segments } from '../../components/ui';
import { addDays, fromKey, toKey } from '../../dates';
import { formatClock, formatDistance, formatMinutes, formatSwimPace } from '../../format';
import { TOTAL_WEEKS } from '../../plan/schedule';
import { Sport } from '../../plan/types';
import { efficiency, formState, highestHeartRate, loadSeries, records, SPORTS, swimsByWater, totals, unitOf, weekVolume } from '../../stats';
import { driftSessions, monthSummary, weeklyZones, weekEnergy } from '../../statsExtra';
import { useStore, useTodayKey } from '../../store';
import { colors, spacing, type } from '../../theme';

const CURVE_DAYS = 120;
const FATIGUE_COLOR = '#A78BFA';

const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

type Page = 'progress' | 'records';
const PAGES: { value: Page; label: string }[] = [
  { value: 'progress', label: 'Progress' },
  { value: 'records', label: 'Records' },
];
const SPORT_CHIPS = SPORTS.map((s) => ({ value: s, label: SPORT_LABELS[s] }));

/** Training: how the plan is going (Progress) and what you have done so far (Records). Health has its own tab. */
export default function StatsScreen() {
  const { schedule, activities, activitiesByDate, settings } = useStore();
  const todayKey = useTodayKey();
  const [page, setPage] = useState<Page>('progress');
  const [volumeSport, setVolumeSport] = useState<Sport>('swim');
  const [curve, setCurve] = useState<'fitness' | 'form'>('fitness');
  const [effSport, setEffSport] = useState<'run' | 'bike'>('run');
  const currentWeek = Math.min(schedule.get(todayKey)?.week ?? (todayKey < settings.planStart ? 1 : TOTAL_WEEKS), TOTAL_WEEKS);

  if (activities.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={type.title}>Training</Text>
          <Empty text="Connect Health Connect in Settings and your workouts will fill in the charts here." />
        </ScrollView>
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

  const eff = { run: efficiency(activities, 'run'), bike: efficiency(activities, 'bike') };
  const effSports = (['run', 'bike'] as const).filter((s) => eff[s].length >= 3);
  const shownEff = effSports.includes(effSport) ? effSport : effSports[0];

  const sinceStart = totals(activities, settings.planStart);
  const best = records(activities, settings.planStart);
  const water = swimsByWater(activities, settings.planStart);
  const zoneWeeks = weeklyZones(activities, settings.planStart, currentWeek, hr.maxHr);
  const drift = driftSessions(activities, 8);
  const month = monthSummary(activities, todayKey);
  const energyNow = weekEnergy(activities, todayKey);
  const energyLast = weekEnergy(activities, toKey(addDays(fromKey(todayKey), -7)));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={type.title}>Training</Text>
        <Segments options={PAGES} value={page} onChange={setPage} />

        {page === 'progress' && (
          <>
            <MonthCard summary={month} />

            <Card title="Volume per week" note="Faded bar: planned. Solid bar: done. Weeks of the plan along the bottom.">
              <Chips options={SPORT_CHIPS} value={volumeSport} onChange={setVolumeSport} colorOf={colorOf} />
              <BarChart
                color={colorOf(volumeSport)}
                tint={tintOf(volumeSport)}
                format={(v) => (unitOf(volumeSport) === 'metres' ? `${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k` : `${(v / 60).toFixed(v % 60 ? 1 : 0)}h`)}
                groups={weeks.map((w, i) => ({
                  label: `${w}`,
                  planned: volumes[i][volumeSport].planned,
                  actual: volumes[i][volumeSport].actual,
                  highlight: w === currentWeek,
                }))}
              />
            </Card>

            <ZonesByWeek weeks={zoneWeeks} />

            <Card title="Fitness and form" note="Training load from heart rate. Fitness builds slowly; fatigue rises and falls with each week. Form is fitness minus fatigue, and should climb above zero in the taper.">
              <Chips
                options={[
                  { value: 'fitness', label: 'Fitness and fatigue' },
                  { value: 'form', label: 'Form' },
                ]}
                value={curve}
                onChange={setCurve}
              />
              {curve === 'fitness' ? (
                <LineChart
                  labels={labels}
                  series={[
                    { label: 'Fitness', color: colors.accent, values: series.map((p) => p.fitness) },
                    { label: 'Fatigue', color: FATIGUE_COLOR, values: series.map((p) => p.fatigue), dashed: true },
                  ]}
                />
              ) : (
                <LineChart labels={labels} zeroLine series={[{ label: 'Form', color: colors.accent, values: series.map((p) => p.form) }]} />
              )}
              <Text style={type.body}>
                Fitness {Math.round(now.fitness)} · Fatigue {Math.round(now.fatigue)} · Form {Math.round(now.form)}
              </Text>
              <Text style={type.small}>{formState(now.form)}</Text>
            </Card>

            {shownEff && (
              <Card title="Efficiency" note="Metres per heartbeat on sessions over 20 minutes. Rising means the same effort takes you further.">
                {effSports.length > 1 && (
                  <Chips options={effSports.map((s) => ({ value: s, label: SPORT_LABELS[s] }))} value={shownEff} onChange={setEffSport} colorOf={colorOf} />
                )}
                <LineChart
                  labels={eff[shownEff].map((p) => shortDate(p.date))}
                  format={(v) => v.toFixed(2)}
                  series={[{ label: SPORT_LABELS[shownEff], color: colorOf(shownEff), values: eff[shownEff].map((p) => p.value) }]}
                />
              </Card>
            )}

            <DriftCard sessions={drift} />
            <EnergyCard now={energyNow} last={energyLast} />
          </>
        )}

        {page === 'records' && (
          <>
            {best.length > 0 && (
              <Card title="Best efforts">
                {best.map((b) => (
                  <View key={b.label} style={styles.totalRow}>
                    <SportBadge kind={b.sport} size={28} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.body}>{b.label}</Text>
                      <Text style={type.small}>
                        {bestValue(b)} · {formatClock(b.activity.movingS)} · {shortDate(b.activity.date)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            <Card title="Totals since the plan began">
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

            {water.pool.count + water.open.count > 0 && (
              <Card title="Pool and open water" note="From the swim type the watch recorded. Tap a swim on its day to change it.">
                {([
                  ['Pool', water.pool],
                  ['Open water', water.open],
                ] as const).map(([label, t]) => (
                  <View key={label} style={styles.totalRow}>
                    <SportBadge kind="swim" size={28} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.body}>
                        {label} · {t.count} {t.count === 1 ? 'swim' : 'swims'}
                      </Text>
                      <Text style={type.small}>{t.count ? `${formatSwimPace(t.metres / t.seconds)} · ${formatDistance(t.metres, true)}` : 'None yet'}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
        <View style={{ height: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
});
