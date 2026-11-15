import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HealthStats } from '../../components/HealthCards';
import { BodyCard, OvernightCard, ReadinessSummary, ReadinessTrend } from '../../components/StatsCards';
import { Card, Empty } from '../../components/ui';
import { morningReadiness, readinessSeries } from '../../health/readiness';
import { baseline } from '../../health/summary';
import { bodyTrend, overnightTrend } from '../../statsExtra';
import { useStore, useTodayKey } from '../../store';
import { colors, spacing, type } from '../../theme';

/** Everything the watch says about you rather than your training: readiness, sleep, recovery, VO2 max and body. */
export default function HealthScreen() {
  const { health } = useStore();
  const todayKey = useTodayKey();
  const today = morningReadiness(health, todayKey);
  const series = readinessSeries(health, todayKey, 14);
  const body = bodyTrend(health, todayKey, 56);
  const overnight = overnightTrend(health, todayKey, 7, baseline(health, 'breathing', todayKey));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={type.title}>Health</Text>
        {Object.keys(health).length === 0 ? (
          <Empty text="Connect Health Connect in Settings to see readiness, sleep, recovery and VO2 max here." />
        ) : (
          <>
            {today && (
              <Card title="Readiness today" note="From last night's sleep, sleeping heart rate and HRV, each against your own usual.">
                <ReadinessSummary readiness={today} />
              </Card>
            )}
            <ReadinessTrend series={series} />
            <HealthStats health={health} todayKey={todayKey} />
            <BodyCard trend={body} />
            <OvernightCard trend={overnight} />
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
});
