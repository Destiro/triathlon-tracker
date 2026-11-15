import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fromKey } from '../dates';
import { formatDistance, formatMinutes } from '../format';
import { MorningReadiness } from '../health/readiness';
import { BodyTrend, DRIFT_GOOD, DRIFT_HIGH, DriftSession, EASY_TARGET, EnergyBySport, MonthSummary, OvernightTrend, ZoneWeek } from '../statsExtra';
import { colors, radius, spacing, type } from '../theme';
import { LineChart } from './charts';
import { colorOf, SPORT_LABELS, SportBadge, tintOf } from './sport';
import { Card } from './ui';
import { ZONE_COLORS } from './ZoneBars';
import { ZONE_NAMES } from '../zones';

const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
const TONE = { good: colors.success, ok: colors.warning, low: colors.danger };

/** How much of each week was easy, as a stacked bar per week, newest at the top. */
export function ZonesByWeek({ weeks }: { weeks: ZoneWeek[] }) {
  if (weeks.length === 0) return null;
  const shown = weeks.slice(-8).reverse();
  const now = shown[0];
  return (
    <Card title="Time in zones" note={`Each week split across the five heart rate zones. Plans in the 80/20 style keep about ${Math.round(EASY_TARGET * 100)}% in zones 1 and 2.`}>
      <View style={styles.between}>
        <Text style={[type.number, { color: now.easyShare >= EASY_TARGET - 0.05 ? colors.success : colors.warning }]}>{Math.round(now.easyShare * 100)}% easy</Text>
        <Text style={type.small}>week {now.week} · {formatMinutes(now.total / 60)} with heart rate</Text>
      </View>
      {shown.map((w) => (
        <View key={w.week} style={styles.zoneRow} accessibilityLabel={`Week ${w.week}: ${Math.round(w.easyShare * 100)}% easy`}>
          <Text style={styles.weekLabel}>W{w.week}</Text>
          <View style={styles.stack}>
            {w.seconds.map((s, i) => (s > 0 ? <View key={i} style={{ flex: s, backgroundColor: ZONE_COLORS[i] }} /> : null))}
          </View>
          <Text style={styles.percent}>{Math.round(w.easyShare * 100)}%</Text>
        </View>
      ))}
      <View style={styles.legend}>
        {ZONE_NAMES.map((n, i) => (
          <View key={n} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: ZONE_COLORS[i] }]} />
            <Text style={type.small}>
              Z{i + 1} {n}
            </Text>
          </View>
        ))}
      </View>
      <Text style={type.small}>Only workouts with a heart rate breakdown count.</Text>
    </Card>
  );
}

/** The readiness score on its own: the number, what it was made from, and how the last two weeks went. */
export function ReadinessSummary({ readiness }: { readiness: MorningReadiness }) {
  const color = TONE[readiness.tone];
  return (
    <>
      <View style={styles.between}>
        <Text style={[type.number, { fontSize: 36, color }]}>{readiness.score}</Text>
        <Text style={[type.heading, { color }]}>{readiness.label}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.line }]}>
        <View style={[styles.fill, { width: `${readiness.score}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.parts}>
        {readiness.parts.map((p) => (
          <View key={p.label} style={{ gap: 2 }}>
            <Text style={type.label}>{p.label}</Text>
            <Text style={styles.value}>{p.value}</Text>
            {p.usual && <Text style={type.small}>usual {p.usual}</Text>}
          </View>
        ))}
      </View>
      {readiness.missing.length > 0 && <Text style={type.small}>Not counted: {readiness.missing.join(', ')}.</Text>}
    </>
  );
}

/** The last two weeks of readiness scores. */
export function ReadinessTrend({ series }: { series: { date: string; score: number | null }[] }) {
  if (series.filter((p) => p.score !== null).length < 3) return null;
  return (
    <Card title="Readiness, last two weeks" note="One score a morning from sleep, sleeping heart rate and HRV, each against your own usual.">
      <LineChart labels={series.map((p) => shortDate(p.date))} format={(v) => String(Math.round(v))} series={[{ label: 'Readiness', color: colors.accent, values: series.map((p) => p.score) }]} />
    </Card>
  );
}

const driftColor = (d: number) => (d < DRIFT_GOOD ? colors.success : d < DRIFT_HIGH ? colors.warning : colors.danger);

/** Heart rate drift on long runs and rides: the same speed costing more beats in the second half. */
export function DriftCard({ sessions }: { sessions: DriftSession[] }) {
  if (sessions.length === 0) return null;
  const recent = sessions.slice(0, 4);
  const average = recent.reduce((s, d) => s + d.drift, 0) / recent.length;
  return (
    <Card title="Heart rate drift" note={`On a long steady session, how much more heart rate the same speed took in the second half. Under ${DRIFT_GOOD}% means the endurance is there.`}>
      <View style={styles.between}>
        <Text style={[type.number, { color: driftColor(average) }]}>{signed(average, 1)}%</Text>
        <Text style={type.small}>average of the last {recent.length}</Text>
      </View>
      {sessions.map(({ activity, drift }) => (
        <View key={activity.id} style={styles.driftRow}>
          <SportBadge kind={activity.sport} size={28} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.body}>
              {SPORT_LABELS[activity.sport]} · {shortDate(activity.date)}
            </Text>
            <View style={[styles.track, { backgroundColor: colors.line }]}>
              <View style={[styles.fill, { width: `${Math.min(Math.max(drift, 0) / 12, 1) * 100}%`, backgroundColor: driftColor(drift) }]} />
            </View>
          </View>
          <Text style={[styles.value, { color: driftColor(drift) }]}>{signed(drift, 1)}%</Text>
        </View>
      ))}
      <Text style={type.small}>Skips the first 10 minutes. Intervals, hills and heat all push it up, so compare steady sessions with steady ones.</Text>
    </Card>
  );
}

const diff = (now: number, before: number, unit: string, digits = 0) => `${signed(now - before, digits)} ${unit}`;

/** This month so far against the same days of last month. */
export function MonthCard({ summary }: { summary: MonthSummary }) {
  const { thisMonth: now, previousSameDays: before } = summary;
  if (now.sessions === 0 && before.sessions === 0) return null;
  const monthName = (m: string) => fromKey(`${m}-01`).toLocaleDateString(undefined, { month: 'long' });
  return (
    <Card title={`${monthName(summary.month)} so far`} note={`Against the same days of ${monthName(summary.previousMonth)}.`}>
      <View style={styles.three}>
        <Tile value={formatMinutes(now.seconds / 60)} label="trained" change={diff(now.seconds / 3600, before.seconds / 3600, 'h', 1)} />
        <Tile value={formatDistance(now.metres)} label="swim, bike, run" change={diff(now.metres / 1000, before.metres / 1000, 'km')} />
        <Tile value={String(now.sessions)} label="sessions" change={diff(now.sessions, before.sessions, '')} />
      </View>
      {summary.biggestWeekS > 0 && <Text style={type.small}>Biggest week this month: {formatMinutes(summary.biggestWeekS / 60)}.</Text>}
    </Card>
  );
}

function Tile({ value, label, change }: { value: string; label: string; change: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={type.small}>{label}</Text>
      <Text style={type.small}>{change}</Text>
    </View>
  );
}

const ENERGY_ORDER: (keyof EnergyBySport)[] = ['bike', 'run', 'swim', 'gym'];

/** Calories burned this week, by sport, against last week. */
export function EnergyCard({ now, last }: { now: { total: number; bySport: EnergyBySport }; last: { total: number } }) {
  if (now.total === 0 && last.total === 0) return null;
  const top = Math.max(...ENERGY_ORDER.map((s) => now.bySport[s]), 1);
  return (
    <Card title="Energy burned" note="Calories the watch counted in your workouts, this week against last. Gym sessions from a gym app often have none.">
      <View style={styles.between}>
        <Text style={type.number}>{Math.round(now.total).toLocaleString('en-US')} kcal</Text>
        <Text style={type.small}>last week {Math.round(last.total).toLocaleString('en-US')}</Text>
      </View>
      {ENERGY_ORDER.filter((s) => now.bySport[s] > 0).map((s) => (
        <View key={s} style={{ gap: 3 }}>
          <View style={styles.between}>
            <Text style={type.body}>{SPORT_LABELS[s]}</Text>
            <Text style={styles.value}>{Math.round(now.bySport[s]).toLocaleString('en-US')}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: tintOf(s) }]}>
            <View style={[styles.fill, { width: `${(now.bySport[s] / top) * 100}%`, backgroundColor: colorOf(s) }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Weight, body fat and lean mass from the watch, with how each has moved. */
export function BodyCard({ trend }: { trend: BodyTrend | null }) {
  if (!trend) return null;
  const { latest, change } = trend;
  const row = (label: string, value: number | undefined, unit: string, delta: number | undefined) =>
    value === undefined ? null : (
      <View style={styles.between} key={label}>
        <Text style={type.body}>{label}</Text>
        <Text style={styles.value}>
          {value.toFixed(1)} {unit}
          {delta !== undefined ? `  ${signed(delta, 1)}` : ''}
        </Text>
      </View>
    );
  return (
    <Card title="Body" note={`Latest readings from ${shortDate(latest.date)}, and the change over ${trend.days / 7} weeks.`}>
      {row('Weight', latest.weightKg, 'kg', change.weightKg)}
      {row('Body fat', latest.bodyFat, '%', change.bodyFat)}
      {row('Lean mass', latest.leanKg, 'kg', change.leanKg)}
    </Card>
  );
}

/** Blood oxygen and breathing rate while asleep, over the last week. */
export function OvernightCard({ trend }: { trend: OvernightTrend | null }) {
  if (!trend) return null;
  const jump = trend.breathing !== undefined && trend.breathingUsual !== undefined ? trend.breathing - trend.breathingUsual : null;
  return (
    <Card title="Overnight" note={`Averages over the last ${trend.nights} night${trend.nights === 1 ? '' : 's'} with readings.`}>
      {trend.spo2 !== undefined && (
        <View style={styles.between}>
          <Text style={type.body}>Blood oxygen</Text>
          <Text style={styles.value}>
            {trend.spo2}%{trend.spo2Low !== undefined ? ` · lowest ${trend.spo2Low}%` : ''}
          </Text>
        </View>
      )}
      {trend.breathing !== undefined && (
        <View style={styles.between}>
          <Text style={type.body}>Breathing</Text>
          <Text style={styles.value}>
            {trend.breathing} / min{trend.breathingUsual !== undefined ? ` · usual ${trend.breathingUsual}` : ''}
          </Text>
        </View>
      )}
      {jump !== null && jump >= 1.5 && (
        <Text style={[type.small, { color: colors.warning }]}>Breathing is {jump.toFixed(1)} a minute above your usual. That often comes a day or two before a cold or after a very hard block.</Text>
      )}
      {trend.spo2 !== undefined && trend.spo2 < 94 && (
        <Text style={[type.small, { color: colors.warning }]}>Wrist blood oxygen reads low for many people. A reading that stays under 94% is worth mentioning to a doctor.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekLabel: { width: 30, fontSize: 12, color: colors.inkSoft, fontFamily: 'monospace' },
  stack: { flex: 1, flexDirection: 'row', height: 14, borderRadius: 4, overflow: 'hidden', gap: 1 },
  percent: { width: 38, textAlign: 'right', fontSize: 12, color: colors.ink, fontFamily: 'monospace' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
  parts: { flexDirection: 'row', gap: spacing.xl, flexWrap: 'wrap' },
  value: { fontSize: 15, fontWeight: '700', color: colors.ink, fontFamily: 'monospace' },
  driftRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  three: { flexDirection: 'row', gap: spacing.md },
  tileValue: { fontSize: 20, fontWeight: '700', color: colors.ink, fontFamily: 'monospace' },
});
