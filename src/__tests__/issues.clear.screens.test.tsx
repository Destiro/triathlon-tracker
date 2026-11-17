/**
 * The real app, with a workout already saved, on Tuesday 17 November 2026: clear an injury that is already logged and see the reminder go from Today.
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
  await AsyncStorage.setItem(KEY, JSON.stringify({ activities: [gym], issues: [{ id: 'k1', kind: 'injury', title: 'Left knee', start: '2026-11-15' }] }));
});

afterEach(() => {
  jest.useRealTimers();
});

const saved = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');

test('clearing an injury on the Health page removes the reminder from Today', async () => {
  await renderRouter(`${__dirname}/../app`);
  expect(await screen.findByText(/Injured: Left knee, day 3/)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText(/^Stats, tab/));
  await fireEvent.press(await screen.findByText('Health', {}, { timeout: 8000 }));
  await fireEvent.press(await screen.findByText('Mark cleared today'));
  expect(await screen.findByText('Reopen')).toBeTruthy();
  await waitFor(async () => expect((await saved()).issues[0].end).toBe('2026-11-17'));

  await fireEvent.press(screen.getByLabelText(/^Today, tab/));
  await waitFor(() => expect(screen.queryByText(/Injured: Left knee/)).toBeNull());
});
