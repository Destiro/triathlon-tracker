/**
 * Draws the Today and Race screens against a fake store, so a screen that crashes while drawing fails here
 * rather than on the phone. Friday 6 November 2026, week 3: the morning swim is in, the run is still to do.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import TodayScreen from '../app/(tabs)/index';
import RaceScreen from '../app/(tabs)/race';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
// Icon fonts can't load outside a phone, so icons draw nothing in these tests.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

jest.mock('../store', () => {
  const { byDate } = jest.requireActual('../activities');
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { activity } = jest.requireActual('./helpers');
  const today = '2026-11-06';
  const settings = { planStart: '2026-10-19', raceDate: '2027-03-05', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
  const activities = [activity({ id: 1, sport: 'swim', date: today, name: 'Morning Swim', distanceM: 1450, movingS: 1880 })];
  const store = {
    ready: true,
    settings,
    schedule: buildSchedule(settings.planStart, settings.raceDate, settings.raceName),
    activities,
    activitiesByDate: byDate(activities),
    connected: true,
    athlete: 'Test',
    lastSync: Date.now(),
    syncing: false,
    syncError: null,
    sync: jest.fn(),
    connectStrava: jest.fn(),
  };
  return { useTodayKey: () => today, useStore: () => store };
});

test('Today puts the run up next and the swim under done', async () => {
  await render(<TodayScreen />);
  expect(screen.getByText('UP NEXT')).toBeTruthy();
  expect(screen.getByText('Foundation Run')).toBeTruthy();
  expect(screen.getByText('Done today')).toBeTruthy();
  expect(screen.getByText('Swim Fartlek + Sprint')).toBeTruthy();
  expect(screen.getByText('This week')).toBeTruthy();
});

test('Race shows the countdown, the course and race week', async () => {
  await render(<RaceScreen />);
  expect(screen.getByText('119')).toBeTruthy();
  expect(screen.getByText('90 km')).toBeTruthy();
  expect(screen.getByText('21.1 km')).toBeTruthy();
  expect(screen.getByText('Tap a day to see the workout.')).toBeTruthy();
  expect(screen.getByText('Fri 5')).toBeTruthy();
});
