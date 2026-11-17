import React from 'react';
import { Card, Empty } from './ui';
import { hasRecovery, LastNight, RecoveryCard, SleepCard, Vo2Card } from './HealthCards';
import { OneCard } from './layout';
import { IssuesCard } from './NoteSheets';
import { BodyCard, OvernightCard, ReadinessSummary, ReadinessTrend } from './StatsCards';
import { morningReadiness, readinessSeries } from '../health/readiness';
import { baseline, latest } from '../health/summary';
import { useStore, useTodayKey } from '../store';
import { bodyTrend, overnightTrend } from '../statsExtra';

/** What the watch says about you rather than your training, one card at a time. */
export function HealthPage() {
  const { health } = useStore();
  const todayKey = useTodayKey();
  const hasHealth = Object.keys(health).length > 0;
  const today = morningReadiness(health, todayKey);
  const series = readinessSeries(health, todayKey, 14);
  const body = bodyTrend(health, todayKey, 56);
  const overnight = overnightTrend(health, todayKey, 7, baseline(health, 'breathing', todayKey));
  return (
    <>
      {!hasHealth && <Empty text="Connect Health Connect in Settings to see sleep, readiness, recovery and VO2 max here." />}
      <OneCard
        key={hasHealth ? 'with-health' : 'without-health'}
        cards={[
        { key: 'night', label: 'Last night', show: hasHealth && Boolean(health[todayKey]?.sleep), node: <LastNight health={health} date={todayKey} /> },
        {
          key: 'readiness',
          label: 'Readiness',
          show: hasHealth && (Boolean(today) || series.filter((p) => p.score !== null).length >= 3),
          node: (
            <>
              {today && (
                <Card title="Readiness today" note="From last night's sleep, sleeping heart rate and HRV, each against your own usual.">
                  <ReadinessSummary readiness={today} />
                </Card>
              )}
              <ReadinessTrend series={series} />
            </>
          ),
        },
        { key: 'sleep', label: 'Sleep', show: hasHealth, node: <SleepCard health={health} todayKey={todayKey} /> },
        { key: 'recovery', label: 'Recovery', show: hasHealth && hasRecovery(health, todayKey), node: <RecoveryCard health={health} todayKey={todayKey} /> },
        { key: 'vo2', label: 'VO2 max', show: hasHealth && latest(health, 'vo2Max', todayKey) !== null, node: <Vo2Card health={health} todayKey={todayKey} /> },
        { key: 'body', label: 'Body', show: hasHealth && body !== null, node: <BodyCard trend={body} /> },
        { key: 'overnight', label: 'Overnight', show: hasHealth && overnight !== null, node: <OvernightCard trend={overnight} /> },
        { key: 'issues', label: 'Injury / illness', node: <IssuesCard /> },
      ]}
      />
    </>
  );
}
