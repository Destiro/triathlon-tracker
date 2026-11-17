/**
 * Draws the Today and Race screens against a fake store, so a screen that crashes while drawing fails here
 * rather than on the phone. Friday 6 November 2026, week 3: the morning swim is in, the run is still to do.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import TodayScreen from '../app/(tabs)/index';
import RaceScreen from '../app/(tabs)/race';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
// Icon fonts can't load outside a phone, so icons draw nothing in these tests.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

// Tests change the date by setting this; the fake store reads it each time.
let mockToday = '2026-11-06';
beforeEach(() => {
  mockToday = '2026-11-06';
  jest.clearAllMocks();
});

jest.mock('../store', () => {
  const { byDate } = jest.requireActual('../activities');
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { activity } = jest.requireActual('./helpers');
  const settings = { planStart: '2026-10-19', raceDate: '2027-03-05', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
  const activities = [activity({ id: 1, sport: 'swim', date: '2026-11-06', name: 'Morning Swim', distanceM: 1450, movingS: 1880 })];
  const store = {
    ready: true,
    settings,
    schedule: buildSchedule(settings.planStart, settings.raceDate, settings.raceName),
    activities,
    activitiesByDate: byDate(activities),
    healthConnected: true,
    checklist: { done: { 'swim.0': true }, extra: [] },
    toggleChecklist: jest.fn(),
    addChecklist: jest.fn(),
    removeChecklist: jest.fn(),
    lastSync: Date.now(),
    syncing: false,
    syncError: null,
    sync: jest.fn(),
    connectHealth: jest.fn(),
    moveWorkout: jest.fn(),
    removeSession: jest.fn(),
    health: {
      '2026-11-06': {
        date: '2026-11-06',
        hrv: 58,
        sleep: {
          start: new Date(2026, 10, 5, 22, 40).toISOString(),
          end: new Date(2026, 10, 6, 6, 10).toISOString(),
          asleepMin: 425,
          awakeMin: 25,
          deepMin: 70,
          remMin: 95,
          lightMin: 260,
          sleepingHr: 52,
        },
      },
    },
    healthSyncing: false,
  };
  return { useTodayKey: () => mockToday, useStore: () => store };
});

test('Today shows every workout for the day at once, with its detail', async () => {
  await render(<TodayScreen />);
  expect(screen.getByText('Swim Fartlek + Sprint')).toBeTruthy();
  expect(screen.getByText('Foundation Run')).toBeTruthy();
  // The run's steps and the recorded swim are on the page, so there is nothing to open.
  expect(screen.getByText('MS: 20 min @ moderate aerobic intensity')).toBeTruthy();
  expect(screen.getByText('Morning Swim')).toBeTruthy();
  // The warm-up / main set / cool-down bar has units on every part and states the whole amount.
  expect(screen.getByText('Main 800 yd')).toBeTruthy();
  expect(screen.getByText('Main 20 min')).toBeTruthy();
  expect(screen.getByText('1,400 yd in total')).toBeTruthy();
  expect(screen.getByText('40 min in total')).toBeTruthy();
  expect(screen.getByText('This week')).toBeTruthy();
  for (const gone of ['UP NEXT', 'Up next', 'Later today', 'Done today']) expect(screen.queryByText(gone)).toBeNull();
});

test('Today has no sleep card: that lives on the Health page of Stats', async () => {
  await render(<TodayScreen />);
  for (const gone of ['This morning', 'Last night', 'Readiness today']) expect(screen.queryByText(gone)).toBeNull();
  expect(screen.queryByText('7 h 05')).toBeNull();
});

test('the cog on Today opens Settings, which is no longer a tab', async () => {
  await render(<TodayScreen />);
  await fireEvent.press(screen.getByLabelText('Settings'));
  expect(router.push).toHaveBeenCalledWith('/settings');
});

test('tapping a workout on Today does not open another screen, and the run can be moved from its card', async () => {
  await render(<TodayScreen />);
  await fireEvent.press(screen.getByText('Foundation Run'));
  expect(router.push).not.toHaveBeenCalled();
  // The swim is done so it stays put; only the run has a Move row.
  expect(screen.getAllByText('Move to another day')).toHaveLength(1);
  await fireEvent.press(screen.getByText('Move to another day'));
  expect(await screen.findByText('Move to…')).toBeTruthy();
});

test('on a rest day Today says so and points to the next workout', async () => {
  mockToday = '2026-11-09'; // Monday of week 4
  await render(<TodayScreen />);
  expect(screen.getByText('Rest day. Recovery is part of the plan.')).toBeTruthy();
  expect(screen.getByText(/^Next · /)).toBeTruthy();
  expect(screen.getByText('Bike Power Intervals')).toBeTruthy();
  await fireEvent.press(screen.getByText('Bike Power Intervals'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/day/[date]', params: { date: '2026-11-10' } });
});

test('Race shows the countdown, and no course card or race week list', async () => {
  await render(<RaceScreen />);
  expect(screen.getByText('119')).toBeTruthy();
  expect(screen.queryByText('The course')).toBeNull();
  expect(screen.queryByText('Tap a day to see the workout.')).toBeNull();
});

test('Race is split into Race day, Ready? and Checklist pages, one at a time', async () => {
  await render(<RaceScreen />);
  expect(screen.getByText('Predicted finish and pacing')).toBeTruthy();
  expect(screen.queryByText('Ready for the distance?')).toBeNull();
  expect(screen.queryByText('Race checklist')).toBeNull();

  await fireEvent.press(screen.getByText('Ready?'));
  expect(screen.getByText('Ready for the distance?')).toBeTruthy();
  expect(screen.getByText('The road there')).toBeTruthy();
  // The road is the first card on the page, above readiness.
  const page = JSON.stringify(screen.toJSON());
  expect(page.indexOf('The road there')).toBeLessThan(page.indexOf('Ready for the distance?'));
  expect(screen.queryByText('Predicted finish and pacing')).toBeNull();

  await fireEvent.press(screen.getByText('Checklist'));
  expect(screen.getByText('Race checklist')).toBeTruthy();
  expect(screen.getByText(/^1 of [0-9]+ ticked[.]$/)).toBeTruthy();
});

test('ticking a checklist item on Race passes its id to the store', async () => {
  const { useStore } = jest.requireMock('../store');
  await render(<RaceScreen />);
  await fireEvent.press(screen.getByText('Checklist'));
  await fireEvent.press(screen.getByLabelText('Helmet'));
  expect(useStore().toggleChecklist).toHaveBeenCalledWith('bike.0');
});


