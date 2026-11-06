/**
 * Drives the Day screen's Move and Add session sheets against a fake store. Friday 6 November 2026, week 3:
 * a 1,400 m swim and a 40 min Foundation Run, with one of your own gym sessions on Thursday.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import DayScreen from '../app/day/[date]';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

let mockDate = '2026-11-06';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ date: mockDate }),
}));

jest.mock('../store', () => {
  const { buildSchedule } = jest.requireActual('../plan/schedule');
  const { applyEdits, addSessions, NO_EDITS } = jest.requireActual('../plan/edits');
  const base = buildSchedule('2026-10-19', '2027-03-05', 'Ironman 70.3 New Zealand');
  const edits = addSessions(NO_EDITS, { date: '2026-11-05', title: 'Legs', minutes: 45, repeatWeekly: true }, '2027-03-05', () => Math.random().toString(36).slice(2));
  const store = {
    settings: { maxHr: 190, restHr: 55 },
    schedule: applyEdits(base, edits),
    activities: [],
    activitiesByDate: new Map(),
    setOpenWater: jest.fn(),
    moveWorkout: jest.fn(),
    addSession: jest.fn(),
    removeSession: jest.fn(),
  };
  return { useTodayKey: () => '2026-11-06', useStore: () => store };
});

// The same fake store the screen sees, so tests can check what it was asked to do.
const mockStore = () => (jest.requireMock('../store') as { useStore: () => Record<string, jest.Mock> }).useStore();

beforeEach(() => {
  jest.clearAllMocks();
  mockDate = '2026-11-06';
});

test('moving the run to another day sends its id, the new day and the day it was planned for', async () => {
  await render(<DayScreen />);
  const moveButtons = screen.getAllByText('Move to another day');
  expect(moveButtons).toHaveLength(2);

  await fireEvent.press(moveButtons[1]); // the Foundation Run
  expect(await screen.findByText('Move to…')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Sat, 7 Nov'));

  expect(mockStore().moveWorkout).toHaveBeenCalledTimes(1);
  expect(mockStore().moveWorkout).toHaveBeenCalledWith('3.4.1', '2026-11-07', '2026-11-06');
  expect(screen.queryByText('Move to…')).toBeNull();
});

test('adding a session sends it with the chosen day', async () => {
  await render(<DayScreen />);
  await fireEvent.press(screen.getByLabelText('Add a session'));
  expect(await screen.findByText('Add a session')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Sun, 8 Nov'));
  await fireEvent.press(screen.getByText('Add session'));

  expect(mockStore().addSession).toHaveBeenCalledWith({ date: '2026-11-08', title: 'Gym', minutes: 45, notes: undefined, repeatWeekly: false });
});

test('a session of your own can be removed, and a repeating one asks how much to remove', async () => {
  mockDate = '2026-11-05';
  await render(<DayScreen />);
  expect(screen.getByText(/added by you/)).toBeTruthy();
  // The plan's own Thursday ride can be moved but not removed, so there is one Remove for two workouts.
  expect(screen.getAllByText('Move to another day')).toHaveLength(2);
  expect(screen.getAllByText('Remove')).toHaveLength(1);

  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByText('Remove'));
  const buttons = alert.mock.calls[0][2] ?? [];
  expect(buttons.map((b) => b.text)).toEqual(['Keep it', 'Just this one', 'This and later weeks']);

  await buttons[2].onPress?.();
  expect(mockStore().removeSession).toHaveBeenCalledWith(expect.any(String), 'later');
});
