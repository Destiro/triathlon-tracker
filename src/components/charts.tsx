import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { routePaths, projectRoute } from '../lib/geo';
import { LoadDay } from '../lib/load';
import { VOLUME_SPORTS, WeekVolume } from '../lib/stats';
import { colors, spacing, sportColors, type } from '../theme';
import { GeoPoint } from '../types';

/** Measures its own width, so charts fill whatever space they're given. */
function useWidth(initial = 300): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(initial);
  return [width, (e) => setWidth(Math.max(100, Math.round(e.nativeEvent.layout.width)))];
}

/** Stacked weekly bars of training time per sport, with an optional dashed target line. */
export function WeeklyBars({ weeks, targetMin, height = 160 }: { weeks: WeekVolume[]; targetMin?: number; height?: number }) {
  const [width, onLayout] = useWidth();
  const maxSec = Math.max(1, ...weeks.map((w) => w.totalSec), (targetMin ?? 0) * 60);
  const gap = 4;
  const barW = Math.max(4, (width - gap * (weeks.length - 1)) / Math.max(1, weeks.length));
  const scale = (sec: number) => (sec / maxSec) * (height - 4);
  const targetY = targetMin ? height - scale(targetMin * 60) : null;
  return (
    <View onLayout={onLayout} accessibilityLabel="Weekly training time by sport">
      <Svg width={width} height={height}>
        {weeks.map((w, i) => {
          let y = height;
          return VOLUME_SPORTS.map((sport) => {
            const h = scale(w.seconds[sport]);
            y -= h;
            return h > 0 ? <Rect key={`${i}-${sport}`} x={i * (barW + gap)} y={y} width={barW} height={h} fill={sportColors[sport]} rx={2} /> : null;
          });
        })}
        {targetY !== null && <Line x1={0} x2={width} y1={targetY} y2={targetY} stroke={colors.inkSoft} strokeDasharray="4 4" strokeWidth={1} />}
      </Svg>
      <View style={styles.legend}>
        {VOLUME_SPORTS.map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: sportColors[s] }]} />
            <Text style={type.small}>{s[0].toUpperCase() + s.slice(1)}</Text>
          </View>
        ))}
        {targetMin ? (
          <View style={styles.legendItem}>
            <View style={[styles.dash]} />
            <Text style={type.small}>Target</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const pathFor = (values: number[], width: number, height: number, min: number, max: number) => {
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? (i / (values.length - 1)) * width : 0;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

/** Fitness and fatigue as lines, with form as a shaded band around zero. */
export function LoadChart({ series, height = 150 }: { series: LoadDay[]; height?: number }) {
  const [width, onLayout] = useWidth();
  if (series.length < 2) return null;
  const all = series.flatMap((d) => [d.fitness, d.fatigue, d.form]);
  const min = Math.min(0, ...all);
  const max = Math.max(10, ...all);
  const zeroY = height - ((0 - min) / (max - min || 1)) * height;
  return (
    <View onLayout={onLayout} accessibilityLabel="Fitness, fatigue and form over time">
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={colors.line} strokeWidth={1} />
        <Path d={`${pathFor(series.map((d) => d.form), width, height, min, max)} L${width},${zeroY} L0,${zeroY} Z`} fill={colors.accentSoft} />
        <Path d={pathFor(series.map((d) => d.fatigue), width, height, min, max)} stroke={colors.danger} strokeWidth={2} fill="none" />
        <Path d={pathFor(series.map((d) => d.fitness), width, height, min, max)} stroke={colors.accent} strokeWidth={2.5} fill="none" />
      </Svg>
      <View style={styles.legend}>
        <LegendLine color={colors.accent} label="Fitness" />
        <LegendLine color={colors.danger} label="Fatigue" />
        <LegendLine color={colors.accentSoft} label="Form" thick />
      </View>
    </View>
  );
}

const LegendLine = ({ color, label, thick }: { color: string; label: string; thick?: boolean }) => (
  <View style={styles.legendItem}>
    <View style={{ width: 14, height: thick ? 8 : 3, borderRadius: 2, backgroundColor: color }} />
    <Text style={type.small}>{label}</Text>
  </View>
);

/** The route drawn as a line, north up, with the start in green and the finish in red. */
export function RouteMap({ route, height = 200, color = colors.accent }: { route: GeoPoint[]; height?: number; color?: string }) {
  const [width, onLayout] = useWidth();
  if (route.length < 2) {
    return (
      <View style={[styles.routeEmpty, { height }]} onLayout={onLayout}>
        <Text style={type.small}>Waiting for GPS…</Text>
      </View>
    );
  }
  const projected = projectRoute(route, width, height, 14);
  // Each stretch between pauses is its own line, so a pause doesn't draw a jump across the map.
  const paths = routePaths(route);
  const offsets = paths.map((_, n) => paths.slice(0, n).reduce((sum, p) => sum + p.length, 0));
  const lines = paths.map((path, n) => projected.slice(offsets[n], offsets[n] + path.length));
  const start = projected[0];
  const end = projected[projected.length - 1];
  return (
    <View onLayout={onLayout} style={styles.route} accessibilityLabel="Map of your route">
      <Svg width={width} height={height}>
        {lines.map((pts, n) => (
          <Polyline key={n} points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" fill="none" />
        ))}
        <Circle cx={start.x} cy={start.y} r={6} fill={sportColors.run} stroke={colors.white} strokeWidth={2} />
        <Circle cx={end.x} cy={end.y} r={6} fill={colors.danger} stroke={colors.white} strokeWidth={2} />
      </Svg>
    </View>
  );
}

/** Horizontal bars for km splits, the fastest highlighted. */
export function SplitBars({ splitsSec, format }: { splitsSec: number[]; format: (sec: number) => string }) {
  if (splitsSec.length === 0) return null;
  const slowest = Math.max(...splitsSec);
  const fastest = Math.min(...splitsSec);
  return (
    <View style={{ gap: 6 }}>
      {splitsSec.map((s, i) => (
        <View key={i} style={styles.splitRow}>
          <Text style={[type.small, styles.splitLabel]}>{i + 1}</Text>
          <View style={styles.splitTrack}>
            <View style={[styles.splitBar, { width: `${Math.max(8, (s / slowest) * 100)}%`, backgroundColor: s === fastest ? sportColors.run : colors.accent }]} />
          </View>
          <Text style={[type.body, styles.splitTime]}>{format(s)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  dash: { width: 14, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.inkSoft },
  route: { backgroundColor: '#EAF1F8', borderRadius: 12, overflow: 'hidden' },
  routeEmpty: { backgroundColor: '#EAF1F8', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  splitLabel: { width: 22, textAlign: 'right' },
  splitTrack: { flex: 1, height: 14, backgroundColor: colors.line, borderRadius: 7, overflow: 'hidden' },
  splitBar: { height: 14, borderRadius: 7 },
  splitTime: { width: 70, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
