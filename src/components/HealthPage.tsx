import React from 'react';
import { Card, Empty } from './ui';
import { hasRecovery, LastNight, RecoveryCard, SleepCard, Vo2Card } from './HealthCards';
import { CardStack } from './layout';
import { IssuesCard } from './NoteSheets';
import { BodyCard, OvernightCard, ReadinessSummary, ReadinessTrend } from './StatsCards';
import { morningReadiness, readinessSeries } from '../health/readiness';
import { baseline, latest } from '../health/summary';
import { useStore, useTodayKey } from '../store';
import { bodyTrend, overnightTrend } from '../statsExtra';

/** What the watch says about you rather than your training, every card on one page. */
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
      <CardStack
        key={hasHealth ? 'with-health' : 'without-health'}
        cards={[
        { key: 'night', show: hasHealth && Boolean(health[todayKey]?.sleep), node: <LastNight health={health} date={todayKey} /> },
        {
          key: 'readiness',
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
        { key: 'sleep', show: hasHealth, node: <SleepCard health={health} todayKey={todayKey} /> },
        { key: 'recovery', show: hasHealth && hasRecovery(health, todayKey), node: <RecoveryCard health={health} todayKey={todayKey} /> },
        { key: 'vo2', show: hasHealth && latest(health, 'vo2Max', todayKey) !== null, node: <Vo2Card health={health} todayKey={todayKey} /> },
        { key: 'body', show: hasHealth && body !== null, node: <BodyCard trend={body} /> },
        { key: 'overnight', show: hasHealth && overnight !== null, node: <OvernightCard trend={overnight} /> },
        { key: 'issues', node: <IssuesCard /> },
      ]}
      />
    </>
  );
}
