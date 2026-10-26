import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, spacing } from '../theme';

const PAD = { left: 34, right: 8, top: 8, bottom: 22 };

/** A nice round top for an axis: 7.3 → 8, 130 → 150. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Measures its own width so charts fill the card on any phone. */
function useWidth() {
  const [width, setWidth] = useState(0);
  return { width, onLayout: (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width)) };
}

export interface BarGroup {
  label: string;
  /** A faded bar behind the solid one, for what was planned. */
  planned?: number;
  actual: number;
  highlight?: boolean;
}

interface BarChartProps {
  groups: BarGroup[];
  color: string;
  tint: string;
  height?: number;
  format: (value: number) => string;
}

/** Planned (faded) against actual (solid) bars, one pair per week. */
export function BarChart({ groups, color, tint, height = 140, format }: BarChartProps) {
  const { width, onLayout } = useWidth();
  const max = niceMax(Math.max(...groups.map((g) => Math.max(g.planned ?? 0, g.actual)), 1));
  const plotW = Math.max(width - PAD.left - PAD.right, 0);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = groups.length ? plotW / groups.length : 0;
  const barW = Math.min(slot * 0.62, 26);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(groups.length / 10);

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map((t) => (
            <React.Fragment key={t}>
              <Line x1={PAD.left} x2={width - PAD.right} y1={y(max * t)} y2={y(max * t)} stroke={colors.line} strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={y(max * t) + 4} fontSize={10} fill={colors.inkSoft} textAnchor="end">
                {format(max * t)}
              </SvgText>
            </React.Fragment>
          ))}
          {groups.map((g, i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            return (
              <React.Fragment key={i}>
                {g.planned ? (
                  <Rect x={x} y={y(g.planned)} width={barW} height={plotH - (y(g.planned) - PAD.top)} rx={4} fill={tint} />
                ) : null}
                {g.actual > 0 && (
                  <Rect
                    x={x + barW * 0.18}
                    y={y(g.actual)}
                    width={barW * 0.64}
                    height={plotH - (y(g.actual) - PAD.top)}
                    rx={3}
                    fill={color}
                    opacity={g.highlight === false ? 0.5 : 1}
                  />
                )}
                {i % labelEvery === 0 && (
                  <SvgText x={x + barW / 2} y={height - 6} fontSize={10} fill={g.highlight ? colors.ink : colors.inkSoft} fontWeight={g.highlight ? '700' : '400'} textAnchor="middle">
                    {g.label}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

export interface Series {
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

interface LineChartProps {
  /** One label per x position; only some are drawn. */
  labels: string[];
  series: Series[];
  height?: number;
  format?: (value: number) => string;
  /** Draw a zero line, for charts that go negative. */
  zeroLine?: boolean;
}

/** Thin lines on a shared axis, with a legend underneath. */
export function LineChart({ labels, series, height = 170, format = (v) => String(Math.round(v)), zeroLine }: LineChartProps) {
  const { width, onLayout } = useWidth();
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const hi = Math.max(...all, 1);
  const lo = zeroLine ? Math.min(...all, 0) : Math.min(...all, hi);
  const top = niceMax(hi);
  const bottom = lo < 0 ? -niceMax(-lo) : zeroLine ? 0 : Math.floor(lo * 0.9);
  const plotW = Math.max(width - PAD.left - PAD.right, 0);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (labels.length > 1 ? (i / (labels.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - ((v - bottom) / (top - bottom || 1)) * plotH;
  const ticks = [bottom, (bottom + top) / 2, top];
  const labelEvery = Math.max(1, Math.ceil(labels.length / 5));

  const pathOf = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {ticks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={colors.line} strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={10} fill={colors.inkSoft} textAnchor="end">
                {format(t)}
              </SvgText>
            </React.Fragment>
          ))}
          {zeroLine && bottom < 0 && <Line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke={colors.inkSoft} strokeWidth={1} />}
          {labels.map((l, i) =>
            i % labelEvery === 0 ? (
              <SvgText key={i} x={x(i)} y={height - 6} fontSize={10} fill={colors.inkSoft} textAnchor="middle">
                {l}
              </SvgText>
            ) : null,
          )}
          {series.map((s) => (
            <Path key={s.label} d={pathOf(s.values)} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
          ))}
        </Svg>
      )}
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 3, borderRadius: 2 },
  legendText: { fontSize: 12, color: colors.inkSoft },
});
