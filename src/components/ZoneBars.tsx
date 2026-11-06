import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatClock } from '../format';
import { colors, spacing, type } from '../theme';
import { ZONE_NAMES, ZoneTarget, zoneVerdict } from '../zones';

// Lighter means harder, so the bars read without relying on hue alone.
const ZONE_COLORS = ['#3B5A8F', '#4F7BC4', '#6EA8FF', '#A5C8FF', '#DCEAFF'];

interface Props {
  /** Seconds in each of the five zones. */
  seconds: number[];
  /** The zones the workout asked for, when it asked for one effort. */
  target: ZoneTarget | null;
  maxHr: number;
}

/** Time in each heart rate zone as bars, with how that compares with what the plan asked for. */
export function ZoneBars({ seconds, target, maxHr }: Props) {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const longest = Math.max(...seconds);
  const verdict = target ? zoneVerdict(seconds, target) : null;

  return (
    <View style={styles.wrap} accessibilityLabel="Heart rate zones">
      <Text style={type.label}>Heart rate zones</Text>
      {seconds.map((s, i) => {
        const wanted = target !== null && i + 1 >= target.from && i + 1 <= target.to;
        return (
          <View key={i} style={styles.row}>
            <Text style={[styles.zone, wanted && styles.zoneWanted]} numberOfLines={1}>
              Z{i + 1} {ZONE_NAMES[i]}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(s / longest) * 100}%`, backgroundColor: ZONE_COLORS[i] }]} />
            </View>
            <Text style={styles.time}>{formatClock(s)}</Text>
            <Text style={styles.percent}>{Math.round((s / total) * 100)}%</Text>
          </View>
        );
      })}
      {verdict && <Text style={[styles.verdict, { color: verdict.onTarget ? colors.success : colors.warning }]}>{verdict.text}</Text>}
      <Text style={type.small}>Zones use a max heart rate of {maxHr} bpm. Change it in Settings.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zone: { width: 96, fontSize: 12, color: colors.inkSoft },
  zoneWanted: { color: colors.ink, fontWeight: '700' },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  time: { width: 44, textAlign: 'right', fontSize: 12, color: colors.ink, fontFamily: 'monospace' },
  percent: { width: 34, textAlign: 'right', fontSize: 12, color: colors.inkSoft, fontFamily: 'monospace' },
  verdict: { fontSize: 13, fontWeight: '600' },
});
