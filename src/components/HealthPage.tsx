import React from 'react';
import { Card, Empty } from './ui';
import { LastNight, HealthStats } from './HealthCards';
import { BodyCard, OvernightCard, ReadinessSummary, ReadinessTrend } from './StatsCards';
import { morningReadiness, readinessSeries } from '../health/readiness';
import { baseline } from '../health/summary';
import { useStore, useTodayKey } from '../store';
import { bodyTrend, overnightTrend } from '../statsExtra';

/** Everything the watch says about you rather than your training: last night, readiness, recovery, VO2 max and body. */
export function HealthPage() {
  const { health } = useStore();
  const todayKey = useTodayKey();
  if (Object.keys(health).length === 0) {
    return <Empty text="Connect Health Connect in Settings to see sleep, readiness, recovery and VO2 max here." />;
  }
  const today = morningReadiness(health, todayKey);
  const series = readinessSeries(health, todayKey, 14);
  const body = bodyTrend(health, todayKey, 56);
  const overnight = overnightTrend(health, todayKey, 7, baseline(health, 'breathing', todayKey));
  return (
    <>
      <LastNight health={health} date={todayKey} />
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
  );
}
