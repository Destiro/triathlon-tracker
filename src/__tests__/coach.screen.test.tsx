/** The Coach tab against a fake store and a scripted Claude: setting up the key, chatting, and applying a change. */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import CoachScreen from '../app/(tabs)/coach';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

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
