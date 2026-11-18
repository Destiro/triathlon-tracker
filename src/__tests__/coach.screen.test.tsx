/** The Coach tab against a fake store and a scripted Claude: setting up the key, chatting, and applying a change. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import CoachScreen from '../app/(tabs)/coach';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

// The phone's speech recognition, faked: the test fires its events by hand.
const mockSpeech: { listeners: Record<string, (e: unknown) => void>; available: boolean; granted: boolean } = { listeners: {}, available: true, granted: true };
jest.mock('expo-speech-recognition', () => ({
  useSpeechRecognitionEvent: (name: string, listener: (e: unknown) => void) => {
    mockSpeech.listeners[name] = listener;
  },
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => mockSpeech.available,
    requestPermissionsAsync: jest.fn(async () => ({ granted: mockSpeech.granted })),
    start: jest.fn(),
    stop: jest.fn(),
  },
}));
const speech = () => jest.requireMock('expo-speech-recognition').ExpoSpeechRecognitionModule;

const mockReplies: unknown[] = [];
jest.mock('../coach/api', () => ({
  ...jest.requireActual('../coach/api'),
  claudeSender: jest.fn(() => async () => mockReplies.shift()),
}));

let mockKey: string | null = null;
jest.mock('../store', () => {
  const data = jest.requireActual('./helpers').coachData();
  const store = { ...data, moveWorkout: jest.fn(), addSession: jest.fn(), removeSession: jest.fn(), saveNote: jest.fn(), logIssue: jest.fn(), clearIssue: jest.fn(), saveCoachKey: jest.fn(async () => true) };
  return { useTodayKey: () => data.todayKey, useStore: () => ({ ...store, coachKey: mockKey }) };
});

const store = () => jest.requireMock('../store').useStore();

beforeEach(() => {
  mockKey = null;
  mockReplies.length = 0;
  Object.assign(mockSpeech, { available: true, granted: true });
});

test('without a key it explains what is sent where and asks for one', async () => {
  await render(<CoachScreen />);
  expect(screen.getByText('Set up the coach')).toBeTruthy();
  expect(screen.getByText(/sent to Anthropic/)).toBeTruthy();
  expect(screen.queryByLabelText('Message')).toBeNull();
});

test('a pasted key that is not an Anthropic key is caught before it is saved', async () => {
  await render(<CoachScreen />);
  await fireEvent.changeText(screen.getByLabelText('Anthropic API key'), 'hello');
  await fireEvent.press(screen.getByText('Save key'));
  expect(screen.getByText(/start with sk-ant-/)).toBeTruthy();
  expect(store().saveCoachKey).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Anthropic API key'), 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
  await fireEvent.press(screen.getByText('Save key'));
  expect(store().saveCoachKey).toHaveBeenCalledWith('sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
});

test('with a key it suggests questions, answers, and applies a change only when you tap Apply', async () => {
  mockKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
  mockReplies.push(
    { content: [{ type: 'tool_use', id: 't1', name: 'move_workout', input: { workout_id: '3.4.1', to_date: '2026-11-07' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'With that cold, I would run tomorrow instead. Tap Apply to move it.' }], stop_reason: 'end_turn' },
  );
  await render(<CoachScreen />);
  expect(screen.getByText('Claude Sonnet 5.5')).toBeTruthy();
  await fireEvent.press(screen.getByText('How did this week go?'));

  expect(await screen.findByText(/run tomorrow instead/)).toBeTruthy();
  expect(screen.getByText('How did this week go?')).toBeTruthy(); // your message stays in the chat
  expect(screen.getByText('Move Foundation Run from Fri, 6 Nov to Sat, 7 Nov')).toBeTruthy();
  expect(store().moveWorkout).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Apply'));
  expect(store().moveWorkout).toHaveBeenCalledWith('3.4.1', '2026-11-07', '2026-11-06');
  expect(screen.getByText('Applied')).toBeTruthy();
  expect(screen.queryByText('Apply')).toBeNull();

  await fireEvent.press(screen.getByText('New chat'));
  expect(screen.getByText('How did this week go?')).toBeTruthy();
  expect(screen.queryByText(/run tomorrow instead/)).toBeNull();
});

test('Cancel leaves the plan alone', async () => {
  mockKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
  mockReplies.push(
    { content: [{ type: 'tool_use', id: 't1', name: 'add_session', input: { date: '2026-11-10', title: 'Mobility', minutes: 20 } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Added as a suggestion.' }], stop_reason: 'end_turn' },
  );
  await render(<CoachScreen />);
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Add some mobility on Tuesday');
  await fireEvent.press(screen.getByLabelText('Send'));
  await screen.findByText('Added as a suggestion.');
  await fireEvent.press(screen.getByText('Cancel'));
  expect(store().addSession).not.toHaveBeenCalled();
  expect(screen.getByText('Cancelled')).toBeTruthy();
});

test('telling the coach how a session went offers a note to save, under its own heading', async () => {
  mockKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
  mockReplies.push(
    { content: [{ type: 'tool_use', id: 't1', name: 'save_workout_note', input: { activity_id: 1, rpe: 7, text: 'Shoulders tired' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Tap Apply to save it on this morning’s swim.' }], stop_reason: 'end_turn' },
  );
  await render(<CoachScreen />);
  await fireEvent.changeText(screen.getByLabelText('Message'), 'This morning’s swim felt hard, 7 out of 10, shoulders tired');
  await fireEvent.press(screen.getByLabelText('Send'));
  await screen.findByText(/Tap Apply to save it/);
  expect(screen.getByText('Note to save')).toBeTruthy();
  await fireEvent.press(screen.getByText('Apply'));
  expect(store().saveNote).toHaveBeenCalledWith(1, { rpe: 7, text: 'Shoulders tired' });
});

describe('speaking a message', () => {
  const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';

  test('what you say fills the box after what you typed, and waits for you to tap Send', async () => {
    mockKey = KEY;
    await render(<CoachScreen />);
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Quick one:');
    await fireEvent.press(screen.getByLabelText('Speak a message'));
    expect(speech().start).toHaveBeenCalledWith(expect.objectContaining({ lang: 'en-NZ', interimResults: true }));

    await act(() => mockSpeech.listeners.start({}));
    expect(screen.getByLabelText('Stop listening')).toBeTruthy();
    expect(screen.getByPlaceholderText('Listening…')).toBeTruthy();

    // Partial guesses replace each other rather than piling up.
    await act(() => mockSpeech.listeners.result({ isFinal: false, results: [{ transcript: 'is my run' }] }));
    await act(() => mockSpeech.listeners.result({ isFinal: true, results: [{ transcript: 'is my run still on today?' }] }));
    await act(() => mockSpeech.listeners.end({}));
    expect(screen.getByLabelText('Message').props.value).toBe('Quick one: is my run still on today?');
    expect(screen.getByLabelText('Speak a message')).toBeTruthy();
    expect(mockReplies).toHaveLength(0); // nothing was sent
  });

  test('tapping again stops listening', async () => {
    mockKey = KEY;
    await render(<CoachScreen />);
    await fireEvent.press(screen.getByLabelText('Speak a message'));
    await act(() => mockSpeech.listeners.start({}));
    await fireEvent.press(screen.getByLabelText('Stop listening'));
    expect(speech().stop).toHaveBeenCalled();
  });

  test('no microphone permission or no recogniser says what to do, without starting', async () => {
    mockKey = KEY;
    mockSpeech.granted = false;
    speech().start.mockClear();
    await render(<CoachScreen />);
    await fireEvent.press(screen.getByLabelText('Speak a message'));
    expect(await screen.findByText(/Allow it in Android settings/)).toBeTruthy();
    expect(speech().start).not.toHaveBeenCalled();

    mockSpeech.available = false;
    await fireEvent.press(screen.getByLabelText('Speak a message'));
    expect(await screen.findByText(/Google app is installed/)).toBeTruthy();
  });

  test('a recognition error shows a message and the mic is ready again', async () => {
    mockKey = KEY;
    await render(<CoachScreen />);
    await fireEvent.press(screen.getByLabelText('Speak a message'));
    await act(() => mockSpeech.listeners.start({}));
    await act(() => mockSpeech.listeners.error({ error: 'no-speech', message: '' }));
    expect(screen.getByText(/Didn’t catch that/)).toBeTruthy();
    expect(screen.getByLabelText('Speak a message')).toBeTruthy();
  });
});
