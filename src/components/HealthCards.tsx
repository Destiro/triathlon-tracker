import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, fromKey, toKey } from '../dates';
import { formatMinutes } from '../format';
import { baseline, HealthByDate, healthSeries, latest, Night, recovery } from '../health/summary';
import { colors, healthColors, radius, spacing, type } from '../theme';
import { BarChart, LineChart } from './charts';
import { Card } from './ui';

const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const SLEEP_NIGHTS = 14;
const TREND_DAYS = 90;

/** Deep, REM, light and awake as one bar, with each part named underneath. */
function StageBar({ night }: { night: Night }) {
  const parts = [
    { label: 'Deep', minutes: night.deepMin, color: healthColors.deep },
    { label: 'REM', minutes: night.remMin, color: healthColors.rem },
    { label: 'Light', minutes: night.lightMin, color: healthColors.light },
    { label: 'Awake', minutes: night.awakeMin, color: healthColors.awake },
  ].filter((p) => p.minutes > 0);
  const total = parts.reduce((s, p) => s + p.minutes, 0);
  // Without stages there is nothing to split.
  if (night.deepMin + night.remMin === 0 || total === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.bar}>
        {parts.map((p) => (
          <View key={p.label} style={{ flex: p.minutes, backgroundColor: p.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={styles.legendItem} accessibilityLabel={`${p.label} ${formatMinutes(p.minutes)}`}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={type.small}>
              {p.label} {formatMinutes(p.minutes)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const TONE_COLORS = { good: colors.success, ok: colors.warning, low: colors.danger };

/** Last night's sleep and how recovered you look, for the top of Today. */
export function LastNight({ health, date }: { health: HealthByDate; date: string }) {
  const day = health[date];
  const night = day?.sleep;
  if (!night) return null;
  const usual = baseline(health, 'asleepMin', date);
  const read = recovery(health, date);
  return (
    <Card>
      <View style={styles.between}>
        <Text style={type.heading}>Last night</Text>
        <Text style={type.small}>
          {clockTime(night.start)} to {clockTime(night.end)}
        </Text>
      </View>
      <View style={styles.between}>
        <Text style={type.number}>{formatMinutes(night.asleepMin)}</Text>
        {usual !== null && <Text style={type.small}>Usually {formatMinutes(usual)}</Text>}
      </View>
      <StageBar night={night} />
      <View style={styles.stats}>
        {night.sleepingHr !== undefined && <Stat label="Sleeping HR" value={`${night.sleepingHr} bpm`} />}
        {day.hrv !== undefined && <Stat label="HRV" value={`${day.hrv} ms`} />}
        {day.restingHr !== undefined && <Stat label="Resting HR" value={`${day.restingHr} bpm`} />}
      </View>
      {read && <Text style={[type.body, { color: TONE_COLORS[read.tone] }]}>{read.text}</Text>}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** Sleep, recovery and VO2 max trends for the Stats tab. Draws nothing for data the watch doesn't provide. */
export function HealthStats({ health, todayKey }: { health: HealthByDate; todayKey: string }) {
  const nights = healthSeries(health, toKey(addDays(fromKey(todayKey), -(SLEEP_NIGHTS - 1))), todayKey);
  const trend = healthSeries(health, toKey(addDays(fromKey(todayKey), -(TREND_DAYS - 1))), todayKey);
  const slept = nights.filter((d) => d.sleep);
  const average = slept.length ? slept.reduce((s, d) => s + d.sleep!.asleepMin, 0) / slept.length : 0;

  const sleepingHr = trend.map((d) => d.sleep?.sleepingHr ?? d.restingHr ?? null);
  const hrv = trend.map((d) => d.hrv ?? null);
  const hasHr = sleepingHr.filter((v) => v !== null).length >= 3;
  const hasHrv = hrv.filter((v) => v !== null).length >= 3;
  const vo2Points = trend.filter((d) => d.vo2Max !== undefined);
  const vo2Now = latest(health, 'vo2Max', todayKey);
  const vo2Start = vo2Points[0]?.vo2Max;
  const labels = trend.map((d) => shortDate(d.date));

  return (
    <>
      {slept.length > 0 && (
        <Card title="Sleep" note={`Hours asleep, last ${SLEEP_NIGHTS} nights. Average ${formatMinutes(average)}.`}>
          <BarChart
            color={healthColors.sleep}
            tint={colors.accentSoft}
            format={(v) => `${(v / 60).toFixed(v % 60 ? 1 : 0)}h`}
            groups={nights.map((d) => ({
              label: String(fromKey(d.date).getDate()),
              actual: d.sleep?.asleepMin ?? 0,
              highlight: d.date === todayKey,
            }))}
          />
        </Card>
      )}

      {(hasHr || hasHrv) && (
        <Card title="Recovery" note="Overnight heart rate falling and HRV rising mean you are absorbing the training. A sudden jump the other way often comes before illness or overreaching.">
          {hasHr && (
            <LineChart labels={labels} format={(v) => String(Math.round(v))} series={[{ label: 'Sleeping heart rate (bpm)', color: healthColors.heart, values: sleepingHr }]} />
          )}
          {hasHrv && <LineChart labels={labels} format={(v) => String(Math.round(v))} series={[{ label: 'HRV (ms)', color: healthColors.hrv, values: hrv }]} />}
        </Card>
      )}

      {vo2Now && (
        <Card title="VO2 max" note="Estimated by your watch from runs with heart rate. It moves slowly: look at the trend over weeks.">
          <View style={styles.between}>
            <Text style={type.number}>{vo2Now.value.toFixed(1)}</Text>
            <Text style={type.small}>
              ml/kg/min · {shortDate(vo2Now.date)}
              {vo2Start !== undefined && vo2Points.length > 1 ? ` · ${vo2Now.value - vo2Start >= 0 ? '+' : ''}${(vo2Now.value - vo2Start).toFixed(1)} in ${TREND_DAYS} days` : ''}
            </Text>
          </View>
          {vo2Points.length >= 2 && (
            <LineChart
              labels={vo2Points.map((d) => shortDate(d.date))}
              format={(v) => v.toFixed(0)}
              series={[{ label: 'VO2 max', color: healthColors.vo2, values: vo2Points.map((d) => d.vo2Max!) }]}
            />
          )}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  bar: { flexDirection: 'row', height: 12, borderRadius: radius.pill, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row', gap: spacing.xl },
  statValue: { fontSize: 15, fontWeight: '700', color: colors.ink, fontFamily: 'monospace' },
});
