/**
 * How a workout went, and injury and illness: drawn against a fake store, so what the screens ask the store to do can
 * be checked. Tuesday 17 November 2026.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { activity } from './helpers';
import { IssueBanner, IssuesCard, NoteRow } from '../components/NoteSheets';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

let mockNotes: Record<string, object> = {};
let mockIssues: object[] = [];

jest.mock('../store', () => {
  const store = {
    saveNote: jest.fn(),
    logIssue: jest.fn(),
    clearIssue: jest.fn(),
    deleteIssue: jest.fn(),
  };
  return {
    useTodayKey: () => '2026-11-17',
    useStore: () => ({ ...store, notes: mockNotes, issues: mockIssues }),
  };
});

const store = () => (jest.requireMock('../store') as { useStore: () => Record<string, jest.Mock> }).useStore();

const gym = activity({ id: 777, sport: 'gym', date: '2026-11-17', name: 'Evening Gym', movingS: 2700 });
const knee = { id: 'k1', kind: 'injury', title: 'Left knee', start: '2026-11-15', severity: 2, notes: 'sore on stairs' };

beforeEach(() => {
  jest.clearAllMocks();
  mockNotes = {};
  mockIssues = [];
});

describe('how it went', () => {
  it('is added from a workout with effort, how you felt, fuelling and a few words', async () => {
    await render(<NoteRow activity={gym} />);
    await fireEvent.press(screen.getByText('Add how it went'));

    await fireEvent.press(screen.getByText('7'));
    expect(screen.getByText('7/10 · Hard')).toBeTruthy();
    await fireEvent.press(screen.getByText('Good'));
    await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), '60');
    await fireEvent.changeText(screen.getByLabelText('Fluid (ml)'), '750');
    await fireEvent.changeText(screen.getByLabelText('What you had'), '2 gels');
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Legs heavy early');
    await fireEvent.press(screen.getByText('Save'));

    expect(store().saveNote).toHaveBeenCalledWith(777, {
      rpe: 7,
      feel: 4,
      text: 'Legs heavy early',
      nutrition: { carbsG: 60, fluidMl: 750, sodiumMg: undefined, caffeineMg: undefined, what: '2 gels' },
    });
    // The sheet closes once it is saved.
    expect(screen.queryByText('How it went')).toBeNull();
  });

  it('shows what was saved, with the session load, and can be changed', async () => {
    mockNotes = { '777': { rpe: 7, feel: 4, text: 'Legs heavy early', nutrition: { carbsG: 60 } } };
    await render(<NoteRow activity={gym} />);
    expect(screen.getByText('Effort 7/10 · Hard · Felt good · 60 g carbs')).toBeTruthy();
    // 7 x 45 minutes.
    expect(screen.getByText('Session load 315 (effort x minutes)')).toBeTruthy();
    expect(screen.getByText('Legs heavy early')).toBeTruthy();

    await fireEvent.press(screen.getByText('Edit how it went'));
    // The saved values are already filled in, and tapping the chosen effort again clears it.
    expect(screen.getByDisplayValue('60')).toBeTruthy();
    await fireEvent.press(screen.getByText('7'));
    await fireEvent.press(screen.getByText('Save'));
    expect(store().saveNote).toHaveBeenCalledWith(777, expect.objectContaining({ rpe: undefined, feel: 4, text: 'Legs heavy early' }));
  });
});

describe('injury and illness', () => {
  it('starts empty, and logs an injury with how bad it is and when it started', async () => {
    await render(<IssuesCard />);
    expect(screen.getByText('Nothing logged. That is the way to keep it.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Log an injury or illness'));

    // Nothing can be saved until it has a name.
    await fireEvent.changeText(screen.getByLabelText('What is it'), 'Left knee');
    await fireEvent.press(screen.getByText('Moderate'));
    await fireEvent.press(screen.getByText('Save'));

    expect(store().logIssue).toHaveBeenCalledWith({ kind: 'injury', title: 'Left knee', start: '2026-11-17', severity: 2, notes: '' });
    // The sheet closes once it is saved, leaving the card's own button.
    expect(screen.queryByText('What is it')).toBeNull();
  });

  it('will not log a blank name or a start day in the future', async () => {
    await render(<IssuesCard />);
    await fireEvent.press(screen.getByText('Log an injury or illness'));
    expect(screen.getByText('Say what it is, such as Left knee.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('What is it'), 'Head cold');
    await fireEvent.changeText(screen.getByLabelText('Started (YYYY-MM-DD)'), '2026-11-20');
    expect(screen.getByText('It cannot start in the future.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(store().logIssue).not.toHaveBeenCalled();
  });

  it('lists what is on and what has cleared, and each can be cleared, reopened or deleted', async () => {
    mockIssues = [knee, { id: 'f1', kind: 'illness', title: 'Flu', start: '2026-11-01', end: '2026-11-05' }];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<IssuesCard />);
    expect(screen.getByText(/Injury · Moderate · .* · ongoing · 3 days/)).toBeTruthy();
    expect(screen.getByText('sore on stairs')).toBeTruthy();
    expect(screen.getByText('Cleared')).toBeTruthy();
    expect(screen.getByText(/Illness · .* to .* · 5 days/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Mark cleared today'));
    expect(store().clearIssue).toHaveBeenCalledWith('k1', '2026-11-17');
    await fireEvent.press(screen.getByText('Reopen'));
    expect(store().clearIssue).toHaveBeenCalledWith('f1', undefined);

    await fireEvent.press(screen.getAllByText('Delete')[0]);
    const buttons = alert.mock.calls[0][2] ?? [];
    await buttons.find((b) => b.text === 'Delete')?.onPress?.();
    expect(store().deleteIssue).toHaveBeenCalledWith('k1');
  });
});

describe('the reminder on Today', () => {
  it('shows while an injury or illness is on, with the day it is on', async () => {
    mockIssues = [knee];
    await render(<IssueBanner />);
    expect(screen.getByText(/Injured: Left knee, day 3/)).toBeTruthy();
  });

  it('is gone once everything has cleared', async () => {
    mockIssues = [{ ...knee, end: '2026-11-16' }];
    await render(<IssueBanner />);
    expect(screen.queryByText(/Injured/)).toBeNull();
  });
});
