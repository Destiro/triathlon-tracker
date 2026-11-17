/**
 * The real app, with a workout already saved: log an injury and see it flagged on Today.
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
  await AsyncStorage.setItem(KEY, JSON.stringify({ settings, activities: [gym] }));
});

// The tab buttons are labelled like "Stats, tab, 3 of 4", unlike the page titles that share their names.
const tab = (name: string) => screen.getByLabelText(new RegExp(`^${name}, tab`));

const saved = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');

test('an injury is logged on the Health page and flagged on Today', async () => {
  await renderRouter(`${__dirname}/../app`);
  await screen.findByText('Evening Gym');
  expect(screen.queryByRole('alert')).toBeNull();

  await fireEvent.press(tab('Stats'));
  // The first visit to Stats draws a lot, so give it longer than the default second.
  await fireEvent.press(await screen.findByText('Health', {}, { timeout: 8000 }));
  // With no health data this is the page's only card, so it shows without a button to choose it.
  expect(screen.getByText('Nothing logged. That is the way to keep it.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Log an injury or illness'));
  await fireEvent.changeText(screen.getByLabelText('What is it'), 'Left knee');
  await fireEvent.press(screen.getByText('Moderate'));
  await fireEvent.press(screen.getByText('Save'));

  expect(await screen.findByText('Left knee')).toBeTruthy();
  expect(screen.getByText(/Injury · Moderate · .* · ongoing · 1 day/)).toBeTruthy();
  await waitFor(async () => expect((await saved()).issues).toHaveLength(1));

  // Today carries a reminder while it is on.
  await fireEvent.press(tab('Today'));
  expect(await screen.findByText(/Injured: Left knee, day 1/)).toBeTruthy();
});
