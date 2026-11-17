import {
  activeIssues,
  addIssue,
  cleanNote,
  HealthIssue,
  issueDays,
  mergeIssues,
  mergeNotes,
  readIssues,
  readNotes,
  removeIssue,
  resolveIssue,
  sessionLoad,
  setNote,
  summariseNote,
} from '../notes';

describe('session notes', () => {
  it('keeps what is usable and drops the rest', () => {
    expect(cleanNote({ rpe: 7.4, feel: 4, text: '  felt strong  ', nutrition: { carbsG: 60.4, fluidMl: 0, what: ' 2 gels ' } })).toEqual({
      rpe: 7,
      feel: 4,
      text: 'felt strong',
      nutrition: { carbsG: 60, what: '2 gels' },
    });
    expect(cleanNote({ rpe: 11, feel: 0, text: '   ', nutrition: { carbsG: -5, fluidMl: NaN } })).toBeNull();
  });

  it('saves a note against a workout and removes it when it is emptied', () => {
    const saved = setNote({}, 42, { rpe: 6, text: 'windy' });
    expect(saved).toEqual({ '42': { rpe: 6, text: 'windy' } });
    expect(setNote(saved, 42, { rpe: undefined, text: '' })).toEqual({});
    expect(saved['42']).toEqual({ rpe: 6, text: 'windy' }); // the old object is untouched
  });

  it('works out session load as effort times minutes', () => {
    expect(sessionLoad(7, 3600)).toBe(420);
    expect(sessionLoad(3, 2700)).toBe(135);
  });

  it('describes a note in one line, leaving out what is missing', () => {
    expect(summariseNote({ rpe: 8, feel: 2, nutrition: { carbsG: 90, fluidMl: 750, what: 'gels' } })).toBe('Effort 8/10 · Very hard · Felt poor · 90 g carbs · 750 ml fluid · gels');
    expect(summariseNote({ text: 'just a note' })).toBe('');
  });

  it('merges a backup under the phone, so the phone wins', () => {
    expect(mergeNotes({ '1': { rpe: 5 } }, { '1': { rpe: 9 }, '2': { rpe: 3 } })).toEqual({ '1': { rpe: 5 }, '2': { rpe: 3 } });
  });

  it('reads saved notes, skipping what is not a note', () => {
    expect(readNotes({ '1': { rpe: 5 }, '2': 'junk', '3': { rpe: 99 } })).toEqual({ '1': { rpe: 5 } });
    expect(readNotes(null)).toEqual({});
    expect(readNotes([1, 2])).toEqual({});
  });
});

describe('injury and illness', () => {
  const knee = addIssue([], { kind: 'injury', title: ' Left knee ', start: '2026-11-10', severity: 2, notes: 'sore on stairs' }, 'a');

  it('adds an issue, trimmed, newest first, and ignores a blank one', () => {
    expect(knee).toEqual([{ id: 'a', kind: 'injury', title: 'Left knee', start: '2026-11-10', severity: 2, notes: 'sore on stairs' }]);
    const both = addIssue(knee, { kind: 'illness', title: 'Head cold', start: '2026-11-14' }, 'b');
    expect(both.map((i) => i.id)).toEqual(['b', 'a']);
    expect(addIssue(both, { kind: 'illness', title: '  ', start: '2026-11-15' }, 'c')).toBe(both);
  });

  it('is active from its first day until the day it clears', () => {
    const issues = resolveIssue(knee, 'a', '2026-11-13');
    expect(activeIssues(issues, '2026-11-09')).toEqual([]);
    expect(activeIssues(issues, '2026-11-10')).toHaveLength(1);
    expect(activeIssues(issues, '2026-11-13')).toHaveLength(1);
    expect(activeIssues(issues, '2026-11-14')).toEqual([]);
    expect(activeIssues(knee, '2027-01-01')).toHaveLength(1); // still open
  });

  it('can be reopened, and will not clear before it started', () => {
    const cleared = resolveIssue(knee, 'a', '2026-11-13');
    expect(resolveIssue(cleared, 'a', undefined)[0].end).toBeUndefined();
    expect(resolveIssue(knee, 'a', '2026-11-01')[0].end).toBeUndefined();
  });

  it('counts the days it has run', () => {
    expect(issueDays(knee[0], '2026-11-10')).toBe(1);
    expect(issueDays(knee[0], '2026-11-16')).toBe(7);
    expect(issueDays({ ...knee[0], end: '2026-11-12' }, '2026-11-16')).toBe(3);
  });

  it('removes an issue', () => {
    expect(removeIssue(knee, 'a')).toEqual([]);
  });

  it('merges a backup under the phone and reads only usable issues', () => {
    const backup: HealthIssue[] = [{ ...knee[0], title: 'Old copy' }, { id: 'z', kind: 'illness', title: 'Flu', start: '2026-10-01' }];
    const merged = mergeIssues(knee, backup);
    expect(merged.map((i) => [i.id, i.title])).toEqual([['a', 'Left knee'], ['z', 'Flu']]);
    expect(readIssues([knee[0], { id: 1 }, 'x', { id: 'q', kind: 'virus', title: 't', start: 's' }])).toEqual([knee[0]]);
    expect(readIssues('nope')).toEqual([]);
  });
});
