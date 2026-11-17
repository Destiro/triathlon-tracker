/**
 * The real app, with a workout already saved: clear an injury that is already logged and see the reminder go from Today.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { addDays, startOfWeek, toKey } from '../dates';
import { activity } from './helpers';

declare const __dirname: string;

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-health-connect', () => ({ openHealthConnectSettings: jest.fn(), SdkAvailabilityStatus: {} }));

const KEY = 'triathlon-tracker/v1';

// Whatever day the tests run on: a plan that began this Monday, with the race a little under twenty weeks off.
const TODAY = toKey(new Date());
const PLAN_START = toKey(startOfWeek(new Date()));
const RACE = toKey(addDays(startOfWeek(new Date()), 137));
const settings = { planStart: PLAN_START, raceDate: RACE };

beforeEach(async () => {
  await AsyncStorage.clear();
  // A gym session the plan knows nothing about, so it shows under "Not in the plan" whatever the plan says for the day.
  const gym = activity({ id: 777, sport: 'gym', date: TODAY, name: 'Evening Gym', movingS: 2700 });
  await AsyncStorage.setItem(KEY, JSON.stringify({ settings, activities: [gym], issues: [{ id: 'k1', kind: 'injury', title: 'Left knee', start: toKey(addDays(new Date(), -2)) }] }));
});

const saved = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');

test('clearing an injury on the Health page removes the reminder from Today', async () => {
  await renderRouter(`${__dirname}/../app`);
  expect(await screen.findByText(/Injured: Left knee, day 3/, {}, { timeout: 15000 })).toBeTruthy();

  await fireEvent.press(screen.getByLabelText(/^Stats, tab/));
  await fireEvent.press(await screen.findByText('Health', {}, { timeout: 8000 }));
  await fireEvent.press(await screen.findByText('Mark cleared today'));
  expect(await screen.findByText('Reopen')).toBeTruthy();
  await waitFor(async () => expect((await saved()).issues[0].end).toBe(TODAY));

  await fireEvent.press(screen.getByLabelText(/^Today, tab/));
  await waitFor(() => expect(screen.queryByText(/Injured: Left knee/)).toBeNull());
});
