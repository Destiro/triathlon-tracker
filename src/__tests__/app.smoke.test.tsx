/**
 * Renders the whole app and drives it like a person would: every tab, the main flows, and a recorded workout
 * with simulated GPS. These catch screens that crash while drawing, which type checks can't.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, AlertButton } from 'react-native';
import App from '../../App';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Heavy: 'heavy', Medium: 'medium', Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
// Icon fonts can't load outside a phone, so icons draw nothing in these tests.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

/** The last GPS callback the app registered, so tests can send it fixes. */
let sendFix: ((loc: unknown) => void) | null = null;
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  watchPositionAsync: jest.fn(async (_options: unknown, callback: (loc: unknown) => void) => {
    sendFix = callback;
    return { remove: jest.fn() };
  }),
}));

/** Answers the next Alert by pressing the button with this text. */
function answerAlert(buttonText: string) {
  jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === buttonText)?.onPress?.();
  });
}

const tab = (name: string) => screen.getByLabelText(new RegExp(`^${name}, tab`));

beforeEach(async () => {
  await AsyncStorage.clear();
  sendFix = null;
});

afterEach(() => jest.restoreAllMocks());

test('a new user sees the welcome and can explore with sample data', async () => {
  await render(<App />);
  expect(await screen.findByText('Welcome to Triathlon Tracker')).toBeTruthy();
  await fireEvent.press(screen.getByText('Explore with sample data'));
  expect(await screen.findByText('Summer Olympic Tri')).toBeTruthy();
  expect(screen.getByText('This week')).toBeTruthy();
  expect(screen.getByText('Recent')).toBeTruthy();
  expect(screen.queryByText('Welcome to Triathlon Tracker')).toBeNull();
});

test('every tab draws with data, and the main pages open', async () => {
  await render(<App />);
  await fireEvent.press(await screen.findByText('Explore with sample data'));

  await fireEvent.press(tab('Log'));
  expect(await screen.findByText('Training log')).toBeTruthy();
  await fireEvent.press(screen.getAllByText('Run')[1]);
  await fireEvent.press(screen.getAllByText('Run')[1]);

  await fireEvent.press(tab('Stats'));
  expect(await screen.findByText('Weekly training')).toBeTruthy();
  expect(screen.getByText('Personal bests')).toBeTruthy();
  expect(screen.getByText('Daily trainers')).toBeTruthy();

  await fireEvent.press(tab('Plan'));
  expect(await screen.findByText('Summer Olympic Tri')).toBeTruthy();
  await fireEvent.press(screen.getByText('Summer Olympic Tri'));
  expect(await screen.findByText('Predicted finish')).toBeTruthy();
  expect(screen.getByText('Race-day targets for 2:35:00')).toBeTruthy();
  await fireEvent.press(screen.getByText('Build a training plan'));
  expect(await screen.findByText('Hours a week at your busiest')).toBeTruthy();
  await fireEvent.press(screen.getByText('Create plan'));
  expect(await screen.findByText('Training for')).toBeTruthy();
  expect(screen.getAllByText(/^Week \d+$/).length).toBeGreaterThan(5);
});

test('a session in the plan opens with its description and a start button', async () => {
  await render(<App />);
  await fireEvent.press(await screen.findByText('Explore with sample data'));
  await fireEvent.press(tab('Plan'));
  await fireEvent.press(await screen.findByText('Summer Olympic Tri'));
  await fireEvent.press(await screen.findByText('Build a training plan'));
  await fireEvent.press(await screen.findByText('Create plan'));
  await fireEvent.press((await screen.findAllByText('Long run'))[0]);
  expect(await screen.findByText('The session')).toBeTruthy();
  expect(screen.getByText('Start this workout')).toBeTruthy();
});

test('recording a run with GPS measures it and saves it to the log', async () => {
  // Simulated time, moved on 30 seconds for each GPS fix, so the fixes look like real running.
  let fakeNow = Date.now();
  jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);

  await render(<App />);
  await fireEvent.press(tab('Track'));
  await fireEvent.press(await screen.findByText('Start run'));
  expect(await screen.findByText('Pause')).toBeTruthy();
  await waitFor(() => expect(sendFix).not.toBeNull());

  // Eleven fixes heading north, 100 m and 30 s apart: 1 km at 5:00 per km.
  const degreesPer100m = 100 / 111_195;
  for (let i = 0; i <= 10; i++) {
    fakeNow += 30_000;
    await act(async () => {
      sendFix!({ coords: { latitude: -41.29 + i * degreesPer100m, longitude: 174.78, altitude: 10, accuracy: 5, speed: 3.3 }, timestamp: fakeNow });
    });
  }
  expect(await screen.findByText('1.00 km')).toBeTruthy();
  expect(screen.getAllByText('±5 m').length).toBeGreaterThan(0);

  await fireEvent.press(screen.getByText('Pause'));
  expect(await screen.findByText('Resume')).toBeTruthy();
  expect(screen.getByText('PAUSED')).toBeTruthy();
  await fireEvent.press(screen.getByText('Resume'));

  answerAlert('Finish');
  await fireEvent.press(screen.getByText('Finish'));
  expect(await screen.findByText('Nice work! Add some details')).toBeTruthy();
  await fireEvent.press(screen.getByText('Save workout'));

  await fireEvent.press(tab('Log'));
  expect(await screen.findByText('Training log')).toBeTruthy();
  expect(screen.getByText('1.00 km')).toBeTruthy();
  expect(screen.getByText(/· GPS$/)).toBeTruthy();
});

test('a pool swim counts lengths', async () => {
  await render(<App />);
  await fireEvent.press(tab('Track'));
  await fireEvent.press(await screen.findByText('Pool swim'));
  await fireEvent.press(screen.getByText('Start pool swim'));
  const button = await screen.findByLabelText('Count a length');
  await fireEvent.press(button);
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(screen.getByText('3')).toBeTruthy();
  await fireEvent.press(screen.getByText('Undo a length'));
  expect(screen.getByText('2')).toBeTruthy();
});

test('a triathlon moves through its legs', async () => {
  await render(<App />);
  await fireEvent.press(tab('Track'));
  await fireEvent.press(await screen.findByText('Triathlon'));
  await fireEvent.press(screen.getByText('Start triathlon'));
  expect(await screen.findByText('Start T1')).toBeTruthy();
  await fireEvent.press(screen.getByText('Start T1'));
  expect(await screen.findByText('Start bike')).toBeTruthy();
  await fireEvent.press(screen.getByText('Start bike'));
  await fireEvent.press(await screen.findByText('Start T2'));
  await fireEvent.press(await screen.findByText('Start run'));
  expect(await screen.findByText('Finish race')).toBeTruthy();
});

test('a workout can be added by hand, and its personal bests are celebrated', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<App />);
  await fireEvent.press(tab('Log'));
  await fireEvent.press(await screen.findByText('Add a workout'));
  await fireEvent.changeText(screen.getByLabelText('Time'), '45');
  await fireEvent.changeText(screen.getByLabelText('Distance (km)'), '9.5');
  await fireEvent.press(screen.getByText('Save workout'));
  expect(await screen.findByText('45:00')).toBeTruthy();
  expect(screen.getByText('9.50 km')).toBeTruthy();
  expect(alert).toHaveBeenCalledWith('2 new personal bests!', expect.stringContaining('Fastest 5 km run'));
});

test('settings open and save', async () => {
  await render(<App />);
  await fireEvent.press(await screen.findByLabelText('Settings'));
  await fireEvent.changeText(await screen.findByLabelText('Your name'), 'Connor');
  await fireEvent.press(screen.getByText('Save settings'));
  expect(await screen.findByText(/, Connor$/)).toBeTruthy();
});
