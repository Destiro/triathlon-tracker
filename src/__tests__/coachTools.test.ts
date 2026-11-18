/** What the coach's tools give Claude, and the changes they will and won't propose. */
import { applyProposal, describeProposal, runTool, TOOLS } from '../coach/tools';
import { coachData } from './helpers';

const read = (name: string, input: Record<string, unknown> = {}) => {
  const out = runTool(name, input, coachData());
  expect(out.isError).toBeFalsy();
  return JSON.parse(out.result);
};

test('every tool has a name, a description and an object schema', () => {
  expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  for (const t of TOOLS) {
    expect(t.description.length).toBeGreaterThan(20);
    expect(t.input_schema.type).toBe('object');
  }
});

test('the overview has today, the plan week, the race and what is on today, with the cold that is on now', () => {
  const o = read('get_overview');
  expect(o).toMatchObject({ today: '2026-11-06', weekday: 'Friday', plan: { week: 3, of: 20, phase: 'Base' }, race: { date: '2027-03-06', daysToGo: 120 } });
  expect(o.todaysWorkouts.map((w: { title: string; status: string }) => [w.title, w.status])).toEqual([
    ['Swim Fartlek + Sprint', 'done'],
    ['Foundation Run', 'today'],
  ]);
  expect(o.injuryOrIllnessNow).toEqual([{ kind: 'illness', title: 'Head cold', since: '2026-11-04', severity: 1 }]);
});

test('the plan gives ids, amounts, steps and status, and marks your own sessions', () => {
  const days = read('get_plan', { from: '2026-11-05', to: '2026-11-06' });
  expect(days).toHaveLength(2);
  expect(days[0].workouts[1]).toMatchObject({ id: 'session.s1', kind: 'gym', title: 'Gym: legs', planned: '45 min', custom: true, repeatsWeekly: true, status: 'missed' });
  expect(days[1].workouts[0]).toMatchObject({ id: '3.4.0', planned: '1,275 m' });
  expect(days[1].workouts[0].steps[0]).toBe('WU: 275 m @ low aerobic intensity');
});

test('a lookup that is too long or back to front is refused with a reason Claude can fix', () => {
  expect(runTool('get_plan', { from: '2026-11-01', to: '2027-01-30' }, coachData())).toMatchObject({ isError: true, result: expect.stringMatching(/42 or fewer/) });
  expect(runTool('get_health', { from: '2026-11-06', to: '2026-11-01' }, coachData())).toMatchObject({ isError: true, result: 'to is before from.' });
  expect(runTool('get_activities', { from: 'yesterday', to: '2026-11-06' }, coachData()).isError).toBe(true);
  expect(runTool('no_such_tool', {}, coachData())).toMatchObject({ isError: true, result: 'There is no tool called no_such_tool.' });
});

test('activities come with distance, time, pace or speed and heart rate, and can be one sport', () => {
  const all = read('get_activities', { from: '2026-11-01', to: '2026-11-06' });
  expect(all).toHaveLength(2);
  expect(read('get_activities', { from: '2026-11-01', to: '2026-11-06', sport: 'bike' })).toEqual([
    { id: 2, date: '2026-11-05', name: 'Evening Ride', sport: 'bike', distanceKm: 31, movingMin: 60, speedKmh: 31, avgHr: 131, climbM: 240 },
  ]);
});

test('health days carry sleep, heart rate and HRV, and days with nothing are left out', () => {
  const days = read('get_health', { from: '2026-11-01', to: '2026-11-06' });
  expect(days.map((d: { date: string }) => d.date)).toEqual(['2026-11-05', '2026-11-06']);
  expect(days[1]).toMatchObject({ asleepHours: 5.2, sleepingHr: 58, restingHr: 54, hrvMs: 44 });
});

test('a week summary compares planned and done for each sport', () => {
  const w = read('get_week_summary', { week: 3 });
  expect(w).toMatchObject({ week: 3, swim: { plannedM: 4100, doneM: 1300 }, bike: { doneMin: 60 } });
  expect(runTool('get_week_summary', { week: 21 }, coachData()).isError).toBe(true);
});

describe('changes', () => {
  test('moving a workout is a proposal, not a change, and remembers the day it was planned for', () => {
    const out = runTool('move_workout', { workout_id: '3.4.1', to_date: '2026-11-07' }, coachData());
    expect(out.result).toMatch(/Nothing is saved yet/);
    expect(out.proposal).toEqual({ kind: 'move', workoutId: '3.4.1', title: 'Foundation Run', from: '2026-11-06', to: '2026-11-07', plannedDate: '2026-11-06' });
    expect(describeProposal(out.proposal!)).toBe('Move Foundation Run from Fri, 6 Nov to Sat, 7 Nov');
  });

  test.each([
    [{ workout_id: 'nope', to_date: '2026-11-07' }, /No workout has that id/],
    [{ workout_id: '20.6.0', to_date: '2027-03-05' }, /Races stay/],
    [{ workout_id: 'session.s1', to_date: '2026-11-07' }, /can't be moved/],
    [{ workout_id: '3.4.1', to_date: '2027-06-01' }, /outside the plan/],
    [{ workout_id: '3.4.1', to_date: '2026-11-06' }, /already on/],
  ])('refuses a move it can not make: %j', (input, reason) => {
    const out = runTool('move_workout', input, coachData());
    expect(out).toMatchObject({ isError: true, result: expect.stringMatching(reason) });
    expect(out.proposal).toBeUndefined();
  });

  test('adding a session checks it and tidies it', () => {
    const out = runTool('add_session', { date: '2026-11-10', title: '  Mobility ', minutes: 20.4, notes: 'Hips and ankles' }, coachData());
    expect(out.proposal).toEqual({ kind: 'add', session: { date: '2026-11-10', title: 'Mobility', minutes: 20, notes: 'Hips and ankles', repeatWeekly: false } });
    expect(describeProposal(out.proposal!)).toBe('Add Mobility (20 min) on Tue, 10 Nov');
    expect(runTool('add_session', { date: '2026-11-10', title: 'Mobility', minutes: 900 }, coachData()).isError).toBe(true);
    expect(runTool('add_session', { date: '2026-11-10', title: ' ', minutes: 20 }, coachData()).isError).toBe(true);
  });

  test('only your own sessions can be removed, and "later" only applies to repeating ones', () => {
    expect(runTool('remove_session', { workout_id: '3.4.1' }, coachData())).toMatchObject({ isError: true });
    const out = runTool('remove_session', { workout_id: 'session.s1', scope: 'later' }, coachData());
    expect(out.proposal).toEqual({ kind: 'remove', sessionId: 's1', title: 'Gym: legs', date: '2026-11-05', scope: 'later' });
    expect(describeProposal(out.proposal!)).toBe('Remove Gym: legs on Thu, 5 Nov and every later week');
  });

  test('applying a proposal calls the matching store action', () => {
    const actions = { moveWorkout: jest.fn(), addSession: jest.fn(), removeSession: jest.fn(), saveNote: jest.fn(), logIssue: jest.fn(), clearIssue: jest.fn() };
    applyProposal({ kind: 'move', workoutId: '3.4.1', title: 'Foundation Run', from: '2026-11-06', to: '2026-11-07', plannedDate: '2026-11-06' }, actions);
    expect(actions.moveWorkout).toHaveBeenCalledWith('3.4.1', '2026-11-07', '2026-11-06');
    applyProposal({ kind: 'remove', sessionId: 's1', title: 'Gym', date: '2026-11-05', scope: 'one' }, actions);
    expect(actions.removeSession).toHaveBeenCalledWith('s1', 'one');
  });
});

describe('notes and the injury and illness log (#9)', () => {
  const withNote = () => ({ ...coachData(), notes: { '1': { rpe: 6, text: 'Arms tired', nutrition: { fluidMl: 300 } } } });

  test('recorded workouts come with the note written on them', () => {
    const [swim] = JSON.parse(runTool('get_activities', { from: '2026-11-06', to: '2026-11-06' }, withNote()).result);
    expect(swim.note).toEqual({ rpe: 6, text: 'Arms tired', nutrition: { fluidMl: 300 } });
  });

  test('the log lists every issue with its id, and says which are still going', () => {
    const issues = JSON.parse(runTool('get_issues', {}, coachData()).result);
    expect(issues).toEqual([{ id: 'cold', kind: 'illness', title: 'Head cold', start: '2026-11-04', ongoing: true, severity: 1 }]);
  });

  test('a note keeps what was already written and changes only what is given', () => {
    const out = runTool('save_workout_note', { activity_id: 1, feel: 2, carbs_g: 40, what_eaten: 'A gel' }, withNote());
    expect(out.proposal).toEqual({
      kind: 'note',
      activityId: 1,
      activityName: 'Morning Swim',
      date: '2026-11-06',
      note: { rpe: 6, feel: 2, text: 'Arms tired', nutrition: { fluidMl: 300, carbsG: 40, what: 'A gel' } },
    });
    expect(describeProposal(out.proposal!)).toBe('Note on Morning Swim, Fri, 6 Nov: Effort 6/10 · Hard · Felt poor · 40 g carbs · 300 ml fluid · A gel · Arms tired');
  });

  test.each([
    [{ activity_id: 99, rpe: 5 }, /No recorded workout/],
    [{ activity_id: 1, rpe: 11 }, /rpe must be 1 to 10/],
    [{ activity_id: 1, feel: 0 }, /feel must be 1 to 5/],
    [{ activity_id: 1, rpe: 6 }, /would not change/],
  ])('refuses a note it can not save: %j', (input, reason) => {
    expect(runTool('save_workout_note', input, withNote())).toMatchObject({ isError: true, result: expect.stringMatching(reason) });
  });

  test('logging an injury is a proposal, and it can not start in the future', () => {
    const out = runTool('log_issue', { kind: 'injury', title: ' Left calf ', start: '2026-11-06', severity: 2, notes: 'Tight on the run' }, coachData());
    expect(out.proposal).toEqual({ kind: 'issue', issue: { kind: 'injury', title: 'Left calf', start: '2026-11-06', severity: 2, notes: 'Tight on the run' } });
    expect(describeProposal(out.proposal!)).toBe('Log an injury: Left calf, since Fri, 6 Nov');
    expect(runTool('log_issue', { kind: 'injury', title: 'Calf', start: '2026-11-09' }, coachData()).isError).toBe(true);
    expect(runTool('log_issue', { kind: 'flu', title: 'Flu', start: '2026-11-05' }, coachData()).isError).toBe(true);
  });

  test('clearing an issue checks the day', () => {
    const out = runTool('clear_issue', { issue_id: 'cold', end: '2026-11-06' }, coachData());
    expect(out.proposal).toEqual({ kind: 'clearIssue', issueId: 'cold', title: 'Head cold', end: '2026-11-06' });
    expect(describeProposal(out.proposal!)).toBe('Mark Head cold as cleared on Fri, 6 Nov');
    expect(runTool('clear_issue', { issue_id: 'cold', end: '2026-11-01' }, coachData()).isError).toBe(true);
    expect(runTool('clear_issue', { issue_id: 'nope', end: '2026-11-06' }, coachData()).isError).toBe(true);
  });

  test('applying them saves the note, logs the issue or clears it', () => {
    const actions = { moveWorkout: jest.fn(), addSession: jest.fn(), removeSession: jest.fn(), saveNote: jest.fn(), logIssue: jest.fn(), clearIssue: jest.fn() };
    applyProposal({ kind: 'note', activityId: 1, activityName: 'Morning Swim', date: '2026-11-06', note: { rpe: 7 } }, actions);
    expect(actions.saveNote).toHaveBeenCalledWith(1, { rpe: 7 });
    applyProposal({ kind: 'issue', issue: { kind: 'injury', title: 'Calf', start: '2026-11-06' } }, actions);
    expect(actions.logIssue).toHaveBeenCalledWith({ kind: 'injury', title: 'Calf', start: '2026-11-06' });
    applyProposal({ kind: 'clearIssue', issueId: 'cold', title: 'Head cold', end: '2026-11-06' }, actions);
    expect(actions.clearIssue).toHaveBeenCalledWith('cold', '2026-11-06');
  });
});
