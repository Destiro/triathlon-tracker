/**
 * The Race tab's predicted finish against a fake store. Monday 14 December 2026, week 8, with three recent pool swims
 * (2:10 /100 m), rides (20 km/h) and runs (6:00 /km): the same figures the prediction tests check by hand.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import RaceScreen from '../app/(tabs)/race';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

// Tests set these; the fake store reads them each time.
let mockToday = '2026-12-14';
let mockActivities: unknown[] = [];

jest.mock('../store', () => {
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const settings = { planStart: '2026-10-19', raceDate: '2027-03-05', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
  const schedule = buildSchedule(settings.planStart, settings.raceDate, settings.raceName);
  return {
    useTodayKey: () => mockToday,
    useStore: () => ({ settings, schedule, activities: mockActivities }),
  };
});

const training = () => {
  const { activity } = jest.requireActual('./helpers');
  const out: unknown[] = [];
  for (let i = 0; i < 3; i++) {
    out.push(activity({ id: 100 + i, sport: 'swim', date: '2026-12-10', distanceM: 1500, movingS: 1950, openWater: false }));
    out.push(activity({ id: 200 + i, sport: 'bike', date: '2026-12-11', distanceM: 30000, movingS: 5400 }));
    out.push(activity({ id: 300 + i, sport: 'run', date: '2026-12-12', distanceM: 10000, movingS: 3600 }));
  }
  return out;
};

beforeEach(() => {
  mockToday = '2026-12-14';
  mockActivities = [];
});

test('predicts a finish from recent training, with a range, the splits and what they are based on', async () => {
  mockActivities = training();
  await render(<RaceScreen />);
  expect(screen.getByText('Predicted finish')).toBeTruthy();
  expect(screen.getByText('7:30')).toBeTruthy();
  expect(screen.getByText('Likely between 6:58 and 8:01')).toBeTruthy();
  expect(screen.getByText('Fair estimate')).toBeTruthy();

  // 1.9 km at 2:23 /100 m, 90 km at 20 km/h, 21.1 km at 6:00 /km, plus the two assumed transitions.
  expect(screen.getByText('45:17')).toBeTruthy();
  expect(screen.getByText('4:30:00')).toBeTruthy();
  expect(screen.getByText('2:06:36')).toBeTruthy();
  expect(screen.getByText('Swim · 2:23 /100m')).toBeTruthy();
  expect(screen.getByText('Bike · 20.0 km/h')).toBeTruthy();
  expect(screen.getByText('Run · 6:00 /km')).toBeTruthy();
  expect(screen.getByText('T1 · 5:00 (assumed)')).toBeTruthy();
  expect(screen.getByText('T2 · 3:00 (assumed)')).toBeTruthy();
  expect(screen.getByText('Average speed of your 3 longest rides. Hills change this a lot.')).toBeTruthy();
});

test('says what is missing when there is not enough training for every leg', async () => {
  const all = training() as { sport: string }[];
  mockActivities = all.filter((a) => a.sport === 'swim');
  await render(<RaceScreen />);
  expect(screen.getByText(/Not enough recent training to predict a finish yet/)).toBeTruthy();
  expect(screen.getByText('Needs a ride of 15 km and 45 minutes or more in the last 6 weeks.')).toBeTruthy();
  expect(screen.getByText('Needs a run of 4 km or more in the last 6 weeks.')).toBeTruthy();
  // The swim can still be predicted on its own.
  expect(screen.getByText('45:17')).toBeTruthy();
  expect(screen.queryByText(/Likely between/)).toBeNull();
});

test('has no prediction once the race is over', async () => {
  mockToday = '2027-03-06';
  mockActivities = training();
  await render(<RaceScreen />);
  expect(screen.queryByText('Predicted finish')).toBeNull();
  expect(screen.getByText('Done')).toBeTruthy();
});
