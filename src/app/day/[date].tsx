import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DayWorkouts } from '../../components/DayWorkouts';
import { AddSessionSheet } from '../../components/PlanSheets';
import { Empty } from '../../components/ui';
import { formatDay, fromKey, isDateKey } from '../../dates';
import { PHASE_LABELS } from '../../plan/schedule';
import { useStore } from '../../store';
import { colors, spacing, type } from '../../theme';

export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { schedule, addSession } = useStore();
  const [adding, setAdding] = useState(false);
  const valid = typeof date === 'string' && isDateKey(date);
  const day = valid ? schedule.get(date) : undefined;

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
        {day && (
          <Pressable onPress={() => setAdding(true)} hitSlop={12} accessibilityLabel="Add a session">
            <MaterialCommunityIcons name="plus-circle-outline" size={30} color={colors.accent} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {valid && day ? <DayWorkouts date={date} /> : <Empty text="This day is outside the plan." />}
      </ScrollView>

      {adding && valid && (
        <AddSessionSheet
          visible
          schedule={schedule}
          initialDate={date}
          onClose={() => setAdding(false)}
          onSave={(session) => {
            addSession(session);
            setAdding(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
});
