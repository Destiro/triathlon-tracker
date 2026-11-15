/**
 * The Plan screen with a forecast: Friday 6 November 2026 is wet (the run should go indoors) and the sea is calm for the
 * morning swim; Tuesday the 3rd is dry for the ride.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PlanScreen from '../app/(tabs)/plan';
import { formatDay, fromKey } from '../dates';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

let mockBeach = true;
let mockWeather = true;
beforeEach(() => {
  mockBeach = true;
  mockWeather = true;
});

jest.mock('../store', () => {
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { DEFAULT_SETTINGS } = jest.requireActual('../settings');
  const settings = { ...DEFAULT_SETTINGS, homePlace: { name: 'Tauranga', latitude: -37.7, longitude: 176.2 } };
  const day = (date: string, over = {}) => ({ date, code: 1, maxC: 21, minC: 14, rainPct: 10, windKmh: 12, ...over });
  const weather = {
    fetchedAt: Date.now(),
    home: { '2026-11-06': day('2026-11-06', { code: 63, rainPct: 70, maxC: 17 }), '2026-11-03': day('2026-11-03') },
    beach: { '2026-11-06': day('2026-11-06', { windKmh: 14 }) },
    sea: { '2026-11-06': { date: '2026-11-06', seaC: 17.5, waveM: 0.6 } },
  };
  const schedule = buildSchedule(settings.planStart, settings.raceDate, settings.raceName);
  return {
    useTodayKey: () => '2026-11-06',
    useStore: () => ({
      settings: mockBeach ? { ...settings, beachPlace: { name: 'Mount Maunganui, Bay of Plenty', latitude: -37.6, longitude: 176.2 } } : settings,
      schedule,
      activitiesByDate: new Map(),
      addSession: jest.fn(),
      weather: mockWeather ? weather : null,
    }),
  };
});

const dayLabel = (key: string) => formatDay(fromKey(key));

test('says the run is better indoors on a wet day, with the reason', async () => {
  await render(<PlanScreen />);
  expect(screen.getByText('Weather')).toBeTruthy();
  expect(screen.getByText('Think indoor')).toBeTruthy();
  expect(screen.getByText('70% chance of rain.')).toBeTruthy();
  expect(screen.getByText('Rain · 17° / 14°')).toBeTruthy();
});

test('shows sea temperature, waves and a wetsuit call for the swim at the beach', async () => {
  await render(<PlanScreen />);
  expect(screen.getByText('Ocean swim')).toBeTruthy();
  expect(screen.getByText('Mount Maunganui, Bay of Plenty')).toBeTruthy();
  expect(screen.getByText('Good for open water')).toBeTruthy();
  expect(screen.getByText('17.5°')).toBeTruthy();
  expect(screen.getByText('0.6 m')).toBeTruthy();
  expect(screen.getByText('Wetsuit on: the sea is under 20°.')).toBeTruthy();
});

test('says good outside on a dry day, and has no ocean card on a day without a swim', async () => {
  await render(<PlanScreen />);
  await fireEvent.press(screen.getByLabelText(dayLabel('2026-11-03')));
  expect(screen.getByText('Good outside')).toBeTruthy();
  expect(screen.queryByText('Think indoor')).toBeNull();
  expect(screen.queryByText('Ocean swim')).toBeNull();
});

test('has no ocean card until a beach is set', async () => {
  mockBeach = false;
  await render(<PlanScreen />);
  expect(screen.queryByText('Ocean swim')).toBeNull();
  expect(screen.getByText('Think indoor')).toBeTruthy();
});

test('has no weather at all until a forecast has been fetched', async () => {
  mockWeather = false;
  await render(<PlanScreen />);
  expect(screen.queryByText('Weather')).toBeNull();
  expect(screen.queryByText('Ocean swim')).toBeNull();
  expect(screen.getByText('Foundation Run')).toBeTruthy();
});
