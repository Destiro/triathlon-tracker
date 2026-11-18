/**
 * Draws the Stats tab against a fake store with workouts that have heart rate zones, calories and drift, and health
 * with body and overnight readings. Sunday 15 November 2026, week 5.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import StatsScreen from '../app/(tabs)/stats';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-health-connect', () => ({}));

let mockBare = false;

jest.mock('../store', () => {
  const { byDate } = jest.requireActual('../activities');
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { combine } = jest.requireActual('../health/summary');
  const { activity } = jest.requireActual('./helpers');
  const settings = { planStart: '2026-10-19', raceDate: '2027-03-06', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
  const halves = { hr1: 140, hr2: 147, v1: 7, v2: 7 };
  const activities = [
    activity({ id: 5, sport: 'bike', date: '2026-11-14', start: '2026-11-14T08:00:00', movingS: 3600, distanceM: 25000, avgHr: 145, avgSpeed: 7, kcal: 620, halves, hr: { 120: 1800, 150: 1800 } }),
    activity({ id: 4, sport: 'run', date: '2026-11-12', start: '2026-11-12T08:00:00', movingS: 2400, distanceM: 6000, avgHr: 150, avgSpeed: 2.5, kcal: 400, halves, hr: { 130: 2400 } }),
    activity({ id: 3, sport: 'swim', date: '2026-11-10', start: '2026-11-10T07:00:00', movingS: 1800, distanceM: 1200, kcal: 250 }),
    activity({ id: 2, sport: 'run', date: '2026-10-28', start: '2026-10-28T08:00:00', movingS: 2400, distanceM: 6000, avgHr: 150, avgSpeed: 2.5 }),
    activity({ id: 1, sport: 'bike', date: '2026-10-21', start: '2026-10-21T08:00:00', movingS: 3600, distanceM: 25000, avgHr: 140, avgSpeed: 7 }),
  ];
  const nights: Record<string, object> = {};
  const hrv: Record<string, number> = {};
  for (let d = 1; d <= 15; d++) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    nights[date] = { start: `2026-11-${String(d).padStart(2, '0')}T00:00:00.000Z`, end: `2026-11-${String(d).padStart(2, '0')}T07:00:00.000Z`, asleepMin: 440, awakeMin: 0, deepMin: 0, remMin: 0, lightMin: 0, sleepingHr: 52 };
    hrv[date] = 60;
  }
  const health = combine({
    nights,
    hrv,
    weight: { '2026-10-20': 75.8, '2026-11-12': 74.2 },
    bodyFat: { '2026-10-20': 16.7, '2026-11-12': 15.8 },
    overnight: { '2026-11-13': { spo2: 95, spo2Low: 91, breathing: 14.5 }, '2026-11-14': { spo2: 96, spo2Low: 93, breathing: 14.1 } },
  });
  const store = { settings, schedule: buildSchedule(settings.planStart, settings.raceDate, settings.raceName), activities, activitiesByDate: byDate(activities), health, notes: {}, issues: [] };
  return {
    useTodayKey: () => '2026-11-15',
    useStore: () => (mockBare ? { ...store, activities: [], activitiesByDate: new Map(), health: {} } : store),
  };
});

beforeEach(() => {
  mockBare = false;
});

test('Stats opens on Progress, with every card on one page and no buttons between them', async () => {
  await render(<StatsScreen />);
  expect(screen.getByText('Stats')).toBeTruthy();
  for (const card of ['November so far', 'Volume per week', 'Time in zones', 'Fitness and form', 'Heart rate drift', '1,270 kcal']) {
    expect(screen.getByText(card)).toBeTruthy();
  }
  for (const gone of ['Month', 'Volume', 'Zones', 'Drift', 'Energy']) expect(screen.queryByText(gone, { exact: true })).toBeNull();
  // The sport chips inside the volume card still switch its chart.
  await fireEvent.press(screen.getAllByText('Bike')[0]);
  expect(screen.getByText('Volume per week')).toBeTruthy();
});

test('Stats keeps bests, totals and pool and open water together on the Records page', async () => {
  await render(<StatsScreen />);
  await fireEvent.press(screen.getByText('Records'));
  // Only the card's own title: no button of the same name.
  expect(screen.getAllByText('Best efforts')).toHaveLength(1);
  expect(screen.getByText('Totals since the plan began')).toBeTruthy();
  expect(screen.queryByText('Totals', { exact: true })).toBeNull();
  expect(screen.queryByText('Time in zones')).toBeNull();
});

test('Stats has Progress, Records and Health pages, and no separate Health tab', async () => {
  await render(<StatsScreen />);
  for (const page of ['Progress', 'Records', 'Health']) expect(screen.getByText(page)).toBeTruthy();
});

test('the Health page shows last night, readiness, body and overnight on one page', async () => {
  await render(<StatsScreen />);
  await fireEvent.press(screen.getByText('Health'));
  // Sleep moved here from Today, and it comes first.
  expect(screen.getAllByText('Last night').length).toBeGreaterThan(0);
  expect(screen.getByText('Readiness today')).toBeTruthy();
  expect(screen.getByText('Readiness, last two weeks')).toBeTruthy();
  // Weight fell 1.6 kg between the two readings.
  expect(screen.getByText('74.2 kg  −1.6')).toBeTruthy();
});

test('Stats leaves out what has no data behind it', async () => {
  mockBare = true;
  await render(<StatsScreen />);
  for (const gone of ['Zones', 'Drift', 'Energy', 'Time in zones', 'Heart rate drift', 'Energy burned']) expect(screen.queryByText(gone)).toBeNull();
  await fireEvent.press(screen.getByText('Health'));
  for (const gone of ['Body', 'Overnight', 'Readiness', 'Readiness today']) expect(screen.queryByText(gone)).toBeNull();
  expect(screen.getByText(/Connect Health Connect in Settings/)).toBeTruthy();
});
