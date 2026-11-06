/**
 * Taps through the month-grid Plan screen against a fake store. Friday 6 November 2026, week 3: the morning swim is
 * in, the run is still to do, and a gym session repeats on Tuesdays.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import PlanScreen from '../app/(tabs)/plan';
import { formatDay, fromKey } from '../dates';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

jest.mock('../store', () => {
  const { byDate } = jest.requireActual('../activities');
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { applyEdits, addSessions, NO_EDITS } = jest.requireActual('../plan/edits');
  const { activity } = jest.requireActual('./helpers');
  const settings = { planStart: '2026-10-19', raceDate: '2027-03-05', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
  const activities = [activity({ id: 1, sport: 'swim', date: '2026-11-06', name: 'Morning Swim', distanceM: 1450, movingS: 1880 })];
  const edits = addSessions(NO_EDITS, { date: '2026-11-03', title: 'Legs', minutes: 45, repeatWeekly: true }, settings.raceDate, () => Math.random().toString(36).slice(2));
  const store = {
    settings,
    schedule: applyEdits(buildSchedule(settings.planStart, settings.raceDate, settings.raceName), edits),
    activitiesByDate: byDate(activities),
    addSession: jest.fn(),
  };
  return { useTodayKey: () => '2026-11-06', useStore: () => store };
});

const dayLabel = (key: string) => formatDay(fromKey(key));

test('opens on this month with today selected and its workouts underneath', async () => {
  await render(<PlanScreen />);
  expect(screen.getByText('November 2026')).toBeTruthy();
  expect(screen.getByText(/· Today/)).toBeTruthy();
  expect(screen.getByText('Foundation Run')).toBeTruthy();
  expect(screen.getByText('Swim Fartlek + Sprint')).toBeTruthy();
  expect(screen.queryByLabelText('Jump to today')).toBeNull();
});

test('shows each plan week with its planned hours', async () => {
  await render(<PlanScreen />);
  // Week 5: 295 min riding, 129 running, 3,050 m of swimming (76 min), plus Tuesday's 45 min gym session.
  expect(screen.getByText('W3')).toBeTruthy();
  expect(screen.getByText('W5')).toBeTruthy();
  expect(screen.getByText('9.1h')).toBeTruthy();
  expect(screen.getByText('W7')).toBeTruthy();
});

test('tapping another day shows that day, and Today jumps back', async () => {
  await render(<PlanScreen />);
  await fireEvent.press(screen.getByLabelText(dayLabel('2026-11-03')));
  expect(screen.getByText('Bike Power Intervals')).toBeTruthy();
  expect(screen.getByText('Legs')).toBeTruthy();
  expect(screen.getByText(/added by you/)).toBeTruthy();
  expect(screen.queryByText('Foundation Run')).toBeNull();

  await fireEvent.press(screen.getByLabelText('Jump to today'));
  expect(screen.getByText('Foundation Run')).toBeTruthy();
});

test('the month arrows move through the plan and stop at its ends', async () => {
  await render(<PlanScreen />);
  await fireEvent.press(screen.getByLabelText('Next month'));
  expect(screen.getByText('December 2026')).toBeTruthy();
  expect(screen.getByLabelText('Jump to today')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Previous month'));
  await fireEvent.press(screen.getByLabelText('Previous month'));
  expect(screen.getByText('October 2026')).toBeTruthy();
  // The plan starts in October, so there is nothing earlier to go to.
  await fireEvent.press(screen.getByLabelText('Previous month'));
  expect(screen.getByText('October 2026')).toBeTruthy();
});

test('Add a session on this day opens the sheet', async () => {
  await render(<PlanScreen />);
  await fireEvent.press(screen.getByText('Add a session on this day'));
  expect(await screen.findByText('Add a session')).toBeTruthy();
});
