import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Activity } from '../activities';
import { formatDay, fromKey, monthGrid, toKey } from '../dates';
import { Schedule } from '../plan/schedule';
import { DayWeather, describeCode, isOutdoor, Limits, outdoorCall } from '../weather';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { dayResult, weekMinutes } from '../stats';
import { colors, radius, spacing } from '../theme';
import { colorOf } from './sport';

const WEEK_COLUMN = 36;

interface Props {
  /** Any date in the month to show. */
  month: Date;
  schedule: Schedule;
  activitiesByDate: Map<string, Activity[]>;
  todayKey: string;
  selected: string;
  onSelect: (date: string) => void;
  /** The forecast by day, when a town is set. A day with a ride or run that is not worth doing outside is marked. */
  weather?: Record<string, DayWeather>;
  limits?: Limits;
}

/**
 * A month as whole weeks, Monday first. Each day shows one dot per workout in its sport's colour: solid once done,
 * faded while still to do. The column on the left names the plan week and its planned hours. Finished weeks fade back.
 */
export function MonthGrid({ month, schedule, activitiesByDate, todayKey, selected, onSelect, weather, limits }: Props) {
  const hasWeather = weather !== undefined && Object.keys(weather).length > 0;
  const days = monthGrid(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <View style={{ width: WEEK_COLUMN }} />
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>

      {weeks.map((row) => {
        const week = row.map((d) => schedule.get(toKey(d))?.week).find((w) => w !== undefined);
        const finished = toKey(row[6]) < todayKey;
        return (
          <View key={toKey(row[0])} style={[styles.row, finished && { opacity: 0.55 }]}>
            <View style={styles.weekColumn}>
              {week !== undefined && (
                <>
                  <Text style={styles.weekNumber}>W{week}</Text>
                  <Text style={styles.weekHours}>{(weekMinutes(schedule, week) / 60).toFixed(1)}h</Text>
                </>
              )}
            </View>
            {row.map((d) => {
              const key = toKey(d);
              const day = schedule.get(key);
              const results = day ? dayResult(schedule, activitiesByDate, key, todayKey).results : [];
              const inMonth = d.getMonth() === month.getMonth();
              const forecast = weather?.[key];
              const wet = forecast && limits && results.some((r) => isOutdoor(r.workout.kind)) ? !outdoorCall(forecast, limits).ok : false;
              return (
                <Pressable
                  key={key}
                  disabled={!day}
                  onPress={() => onSelect(key)}
                  accessibilityLabel={formatDay(fromKey(key))}
                  accessibilityState={{ selected: key === selected, disabled: !day }}
                  style={[styles.cell, hasWeather && styles.cellTall, key === selected && styles.cellSelected, key === todayKey && styles.cellToday, !inMonth && { opacity: 0.45 }]}
                >
                  <View style={styles.top}>
                  <Text style={[styles.date, key === todayKey && { color: colors.accent, fontWeight: '800' }, !day && { color: colors.inkFaint }]}>
                    {d.getDate()}
                  </Text>
                  <View style={styles.dots}>
                    {results.map((r, i) => {
                      const colour = colorOf(r.workout.kind);
                      const done = r.status === 'done';
                      const partial = r.status === 'partial';
                      return (
                        <View
                          key={i}
                          style={[styles.dot, { borderColor: colour, backgroundColor: done ? colour : partial ? `${colour}80` : 'transparent' }]}
                        />
                      );
                    })}
                  </View>
                  </View>
                  {hasWeather && (
                    <View style={styles.weather} accessibilityLabel={forecast ? `${describeCode(forecast.code).label}, ${Math.round(forecast.maxC)} degrees` : undefined}>
                      {forecast && (
                        <>
                          <MaterialCommunityIcons name={describeCode(forecast.code).icon as never} size={13} color={wet ? colors.warning : colors.inkSoft} />
                          <Text style={[styles.temp, wet && { color: colors.warning }]}>{Math.round(forecast.maxC)}°</Text>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 2 },
  row: { flexDirection: 'row', gap: 2 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.inkSoft, paddingBottom: spacing.xs },
  weekColumn: { width: WEEK_COLUMN, justifyContent: 'center', alignItems: 'center' },
  weekNumber: { fontSize: 11, fontWeight: '700', color: colors.ink },
  weekHours: { fontSize: 10, color: colors.inkSoft, fontFamily: 'monospace' },
  cell: {
    flex: 1,
    height: 38,
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingHorizontal: 4,
    gap: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellTall: { height: 50 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weather: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 14 },
  temp: { fontSize: 10, color: colors.inkSoft, fontFamily: 'monospace' },
  cellSelected: { backgroundColor: colors.accentSoft },
  cellToday: { borderColor: colors.accent },
  date: { fontSize: 12, color: colors.inkSoft, fontFamily: 'monospace' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2, maxWidth: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
});
