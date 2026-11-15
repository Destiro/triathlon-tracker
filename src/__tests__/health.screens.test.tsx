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
let mockPastData = true;
beforeEach(() => {
  mockConnected = true;
  mockPastData = true;
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
    settings: { ...settings, rainLimit: 40, windLimit: 30, waveLimit: 1, wetsuitBelow: 20 },
    schedule: buildSchedule(settings.planStart, settings.raceDate, settings.raceName),
    activities: [],
    activitiesByDate: new Map(),
    sync: jest.fn(),
    lastBackup: null,
    weather: null,
    weatherUpdating: false,
    weatherError: null,
    setPlace: jest.fn(async (kind: string, name: string) => `Set to ${name} (${kind}).`),
    clearPlace: jest.fn(),
    refreshWeather: jest.fn(),
    exportBackup: jest.fn(async () => 'Backup made. Keep it somewhere off this phone, like Google Drive.'),
    restoreBackup: jest.fn(async () => ''),
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
    useStore: () => ({ ...store, healthConnected: mockConnected, pastDataAllowed: mockPastData }),
  };
});

test('Stats shows sleep, recovery and VO2 max even with no workouts yet', async () => {
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
  expect(screen.getByText(/0 workouts and 11 days of health saved/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Choose what the app can read'));
  expect(openHealthConnectSettings).toHaveBeenCalled();
});

test('Settings has no Strava sign-in left in it', async () => {
  await render(<SettingsScreen />);
  expect(screen.queryByText('Strava')).toBeNull();
  expect(screen.queryByText('Connect Strava')).toBeNull();
});

test('Settings makes a backup and says where to keep it', async () => {
  const { useStore } = jest.requireMock('../store');
  await render(<SettingsScreen />);
  expect(screen.getByText('No backup made yet')).toBeTruthy();
  await fireEvent.press(screen.getByText('Back up now'));
  expect(useStore().exportBackup).toHaveBeenCalled();
  expect(await screen.findByText('Backup made. Keep it somewhere off this phone, like Google Drive.')).toBeTruthy();
});

test('Settings asks before restoring a backup', async () => {
  const { Alert } = jest.requireActual('react-native');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { useStore } = jest.requireMock('../store');
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Restore from a backup'));
  expect(alert).toHaveBeenCalledWith('Restore a backup?', expect.stringContaining('nothing here is removed'), expect.any(Array));
  expect(useStore().restoreBackup).not.toHaveBeenCalled();
  alert.mockRestore();
});

test('Settings warns when only the last 30 days can be read', async () => {
  mockPastData = false;
  await render(<SettingsScreen />);
  expect(screen.getByText(/Only the last 30 days can be read/)).toBeTruthy();
});

test('Settings looks a town up by name and shows what it found', async () => {
  const { useStore } = jest.requireMock('../store');
  await render(<SettingsScreen />);
  expect(screen.getByText('Weather')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Your town'), 'Tauranga');
  await fireEvent.press(screen.getAllByText('Find it')[0]);
  expect(useStore().setPlace).toHaveBeenCalledWith('home', 'Tauranga');
  expect(await screen.findByText('Set to Tauranga (home).')).toBeTruthy();
});

test('Settings has the limits for think indoor, with their usual values', async () => {
  await render(<SettingsScreen />);
  expect(screen.getByText('Think indoor when rain is likelier than (%)')).toBeTruthy();
  expect(screen.getByDisplayValue('40')).toBeTruthy();
  expect(screen.getByDisplayValue('30')).toBeTruthy();
});

test('Settings offers to connect Health Connect', async () => {
  mockConnected = false;
  const { useStore } = jest.requireMock('../store');
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Connect Health Connect'));
  expect(useStore().connectHealth).toHaveBeenCalled();
});
