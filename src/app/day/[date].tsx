import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Empty } from '../../components/ui';
import { doneSummary, WorkoutCard } from '../../components/WorkoutCard';
import { SportBadge } from '../../components/sport';
import { formatDay, fromKey, isDateKey } from '../../dates';
import { formatRunPace, formatSpeed, formatSwimPace } from '../../format';
import { PHASE_LABELS } from '../../plan/schedule';
import { dayResult } from '../../stats';
import { useStore, useTodayKey } from '../../store';
import { colors, spacing, type } from '../../theme';

export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { schedule, activitiesByDate } = useStore();
  const todayKey = useTodayKey();
  const valid = typeof date === 'string' && isDateKey(date);
  const day = valid ? schedule.get(date) : undefined;
  const result = valid ? dayResult(schedule, activitiesByDate, date, todayKey) : { results: [], extras: [] };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={32} color={colors.accent} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={type.title}>{valid ? formatDay(fromKey(date)) : 'Unknown day'}</Text>
          {day && (
            <Text style={type.small}>
              Week {day.week} · {PHASE_LABELS[day.phase]}
              {day.recovery ? ' · recovery week' : ''}
            </Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {!day ? (
          <Empty text="This day is outside the plan." />
        ) : result.results.length === 0 ? (
          <Card>
            <Text style={type.body}>Rest day. Recovery is part of the plan.</Text>
          </Card>
        ) : (
          result.results.map((r, i) => (
            <View key={i} style={{ gap: spacing.sm }}>
              <WorkoutCard result={r} detailed />
              {r.activities.map((a) => (
                <Card key={a.id}>
                  <Text style={type.heading}>{a.name}</Text>
                  <Text style={type.small}>{doneSummary(a)}</Text>
                  <Text style={type.small}>
                    {[
                      a.sport === 'run' ? formatRunPace(a.avgSpeed) : a.sport === 'swim' ? formatSwimPace(a.avgSpeed) : a.sport === 'bike' ? formatSpeed(a.avgSpeed) : '',
                      a.avgHr ? `${Math.round(a.avgHr)} bpm average` : '',
                      a.elevationM >= 10 ? `${Math.round(a.elevationM)} m climbing` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Card>
              ))}
            </View>
          ))
        )}

        {result.extras.length > 0 && (
          <>
            <Text style={type.heading}>Not in the plan</Text>
            {result.extras.map((a) => (
              <Card key={a.id}>
                <View style={styles.extra}>
                  <SportBadge kind={a.sport} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{a.name}</Text>
                    <Text style={type.small}>{doneSummary(a)}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  extra: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
