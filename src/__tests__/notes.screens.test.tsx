/**
 * The real app, with a workout already saved, on Tuesday 17 November 2026: add how a workout went, log an injury, see
 * both again, and check they were saved.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { activity } from './helpers';

declare const __dirname: string;

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-health-connect', () => ({ openHealthConnectSettings: jest.fn(), SdkAvailabilityStatus: {} }));

const KEY = 'triathlon-tracker/v1';

beforeEach(async () => {
  // Only the date is faked: timers stay real so the app and the test can wait normally.
  jest.useFakeTimers({
    now: new Date(2026, 10, 17, 9, 0),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
  });
  await AsyncStorage.clear();
  // A gym session the plan knows nothing about, so it shows under "Not in the plan" whatever the plan says for the day.
  const gym = activity({ id: 777, sport: 'gym', date: '2026-11-17', name: 'Evening Gym', movingS: 2700 });
  await AsyncStorage.setItem(KEY, JSON.stringify({ activities: [gym] }));
});

afterEach(() => {
  jest.useRealTimers();
});

const saved = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');

test('how a workout went can be added from Today, shows afterwards, and is saved', async () => {
  await renderRouter(`${__dirname}/../app`);
  expect(await screen.findByText('Evening Gym')).toBeTruthy();
  await fireEvent.press(screen.getByText('Add how it went'));

  await fireEvent.press(screen.getByText('7'));
  expect(screen.getByText('7/10 · Hard')).toBeTruthy();
  await fireEvent.press(screen.getByText('Good'));
  await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), '60');
  await fireEvent.changeText(screen.getByLabelText('Notes'), 'Legs heavy early');
  await fireEvent.press(screen.getByText('Save'));

  expect(await screen.findByText('Effort 7/10 · Hard · Felt good · 60 g carbs')).toBeTruthy();
  expect(screen.getByText('Session load 315 (effort x minutes)')).toBeTruthy();
  expect(screen.getByText('Legs heavy early')).toBeTruthy();
  expect(screen.getByText('Edit how it went')).toBeTruthy();
  await waitFor(async () => expect((await saved()).notes).toEqual({ '777': { rpe: 7, feel: 4, text: 'Legs heavy early', nutrition: { carbsG: 60 } } }));
});
