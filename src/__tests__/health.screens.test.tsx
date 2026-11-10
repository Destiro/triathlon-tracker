/**
 * Draws Stats and Settings with health data from Health Connect, against a fake store. Wednesday 10 November 2026,
 * with a month of steady nights behind it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import SettingsScreen from '../app/(tabs)/settings';
import StatsScreen from '../app/(tabs)/stats';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
// The native module only exists in a real build.
jest.mock('react-native-health-connect', () => ({ openHealthConnectSettings: jest.fn(), SdkAvailabilityStatus: {} }));

let mockConnected = true;
beforeEach(() => {
  mockConnected = true;
  jest.clearAllMocks();
});

jest.mock('../store', () => {
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { combine } = jest.requireActual('../health/summary');
  const settings = { planStart: '2026-10-19', raceDate: '2027-03-05', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
  const nights: Record<string, object> = {};
  const hrv: Record<string, number> = {};
  for (let d = 1; d <= 10; d++) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    nights[date] = { start: '', end: '', asleepMin: 420 + d, awakeMin: 0, deepMin: 0, remMin: 0, lightMin: 0, sleepingHr: 50 };
    hrv[date] = 60;
  }
  const health = combine({ nights, hrv, vo2Max: { '2026-10-20': 47.2, '2026-11-08': 48.6 } });
  const store = {
    settings,
    schedule: buildSchedule(settings.planStart, settings.raceDate, settings.raceName),
    activities: [],
    activitiesByDate: new Map(),
    connected: false,
    syncing: false,
    syncError: null,
    lastSync: null,
    health,
    lastHealthSync: Date.now(),
    healthSyncing: false,
    healthError: null,
    connectHealth: jest.fn(),
    disconnectHealth: jest.fn(),
    updateSettings: jest.fn(),
  };
  return {
    useTodayKey: () => '2026-11-10',
    useStore: () => ({ ...store, healthConnected: mockConnected }),
  };
});

test('Stats shows sleep, recovery and VO2 max even before Strava is connected', async () => {
  await render(<StatsScreen />);
  expect(screen.getByText('Sleep')).toBeTruthy();
  expect(screen.getByText('Recovery')).toBeTruthy();
  expect(screen.getAllByText('VO2 max').length).toBeGreaterThan(0);
  expect(screen.getByText('48.6')).toBeTruthy();
  expect(screen.getByText(/\+1\.4 in 90 days/)).toBeTruthy();
});

test('Settings shows Health Connect as connected, with a way to manage access', async () => {
  const { openHealthConnectSettings } = jest.requireMock('react-native-health-connect');
  await render(<SettingsScreen />);
  expect(screen.getByText(/11 days so far/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Choose what the app can read'));
  expect(openHealthConnectSettings).toHaveBeenCalled();
});

test('Settings offers to connect Health Connect', async () => {
  mockConnected = false;
  const { useStore } = jest.requireMock('../store');
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Connect Health Connect'));
  expect(useStore().connectHealth).toHaveBeenCalled();
});
