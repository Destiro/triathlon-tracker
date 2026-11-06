/**
 * Heart rate zones, the pool / open water tag and the personal best card, against a fake store. Thursday 5 November:
 * a 60 min Foundation Bike ridden for 60 min with a heart rate breakdown. Friday 6 November (today): a pool swim.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import TodayScreen from '../app/(tabs)/index';
import DayScreen from '../app/day/[date]';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

let mockDate = '2026-11-05';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ date: mockDate }),
}));

jest.mock('../store', () => {
  const { byDate } = jest.requireActual('../activities');
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { activity } = jest.requireActual('./helpers');
  const settings = { planStart: '2026-10-19', raceDate: '2027-03-05', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
  const activities = [
    activity({ id: 12, sport: 'swim', date: '2026-11-06', name: 'Morning Swim', distanceM: 1450, movingS: 1880, openWater: false }),
    // Thursday: 60 min ride. At a max heart rate of 190, zone 2 starts at 114, zone 3 at 133 and zone 4 at 152.
    activity({ id: 11, sport: 'bike', date: '2026-11-05', name: 'Thursday Ride', distanceM: 32000, movingS: 3600, avgHr: 138, hr: { 120: 300, 140: 2400, 160: 900 } }),
    activity({ id: 10, sport: 'bike', date: '2026-10-25', name: 'Old Ride', distanceM: 30000, movingS: 5400 }),
  ];
  const store = {
    settings,
    schedule: buildSchedule(settings.planStart, settings.raceDate, settings.raceName),
    activities,
    activitiesByDate: byDate(activities),
    connected: true,
    lastSync: Date.now(),
    syncing: false,
    syncError: null,
    sync: jest.fn(),
    connectStrava: jest.fn(),
    moveWorkout: jest.fn(),
    removeSession: jest.fn(),
    addSession: jest.fn(),
    setOpenWater: jest.fn(),
  };
  return { useTodayKey: () => '2026-11-06', useStore: () => store };
});

const store = () => (jest.requireMock('../store') as { useStore: () => Record<string, jest.Mock> }).useStore();

beforeEach(() => {
  jest.clearAllMocks();
  mockDate = '2026-11-05';
});

test('a recorded ride shows its time in each zone and how that compares with the plan', async () => {
  await render(<DayScreen />);
  expect(screen.getByText('Heart rate zones')).toBeTruthy();
  expect(screen.getByText('Z3 Tempo')).toBeTruthy();
  // 40 of the 60 minutes in zone 3, 5 in zone 2, 15 in zone 4.
  expect(screen.getByText('40:00')).toBeTruthy();
  expect(screen.getByText('On target: 75% of the time in zones 2–3 (moderate aerobic).')).toBeTruthy();
  expect(screen.getByText('Zones use a max heart rate of 190 bpm. Change it in Settings.')).toBeTruthy();
});

test('an activity without a heart rate breakdown shows no zones', async () => {
  mockDate = '2026-11-06';
  await render(<DayScreen />);
  expect(screen.queryByText('Heart rate zones')).toBeNull();
});

test('a swim shows whether it was a pool or open water, and tapping corrects it', async () => {
  mockDate = '2026-11-06';
  await render(<DayScreen />);
  const tag = screen.getByLabelText('Swim recorded in a pool. Tap to change.');
  expect(screen.getByText('Pool')).toBeTruthy();
  await fireEvent.press(tag);
  expect(store().setOpenWater).toHaveBeenCalledWith(12, true);
});

test('Today celebrates a new best from the last two days, with the one it beat', async () => {
  await render(<TodayScreen />);
  expect(screen.getByText('New best · Longest ride')).toBeTruthy();
  expect(screen.getByText('32.0 km')).toBeTruthy();
  expect(screen.getByText('Your last best was 30.0 km on 25 Oct.')).toBeTruthy();
  expect(screen.getByText('New best · Fastest ride (20 km+)')).toBeTruthy();
});
