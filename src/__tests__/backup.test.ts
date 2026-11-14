import { BackupData, backupFileName, describeBackup, makeBackup, readBackup, restoreInto } from '../backup';
import { NO_EDITS } from '../plan/edits';
import { activity } from './helpers';

const settings = { planStart: '2026-10-19', raceDate: '2027-03-05', raceName: 'Ironman 70.3 New Zealand', maxHr: 190, restHr: 55 };
const run = activity({ id: 16000000001, sport: 'run', date: '2026-10-20', hr: { 140: 1800 } });
const swim = activity({ id: 16000000002, sport: 'swim', date: '2026-10-21', openWater: false });
const today = activity({ id: Date.parse('2026-11-15T21:00:00Z'), sport: 'bike', date: '2026-11-16', source: 'health' });

const data = (over: Partial<BackupData> = {}): BackupData => ({
  settings,
  activities: [run, swim],
  edits: NO_EDITS,
  waterOverrides: { [swim.id]: true },
  health: { '2026-10-21': { date: '2026-10-21', hrv: 60 } },
  ...over,
});

describe('backup files', () => {
  it('come back exactly as they were made', () => {
    const text = makeBackup(data(), new Date('2026-11-16T08:00:00Z'));
    const back = readBackup(text);
    expect(back.data).toEqual(data());
    expect(back.exportedAt).toBe('2026-11-16T08:00:00.000Z');
  });

  it('are named by the day they were made', () => {
    expect(backupFileName(new Date(2026, 10, 16, 9))).toBe('triathlon-tracker-backup-2026-11-16.json');
  });

  it('turn away anything that is not a backup, with a reason to show', () => {
    expect(() => readBackup('not json')).toThrow('not a Triathlon Tracker backup');
    expect(() => readBackup(JSON.stringify({ app: 'other', data: {} }))).toThrow('not a Triathlon Tracker backup');
    expect(() => readBackup(JSON.stringify({ app: 'triathlon-tracker', version: 99, data: { settings } }))).toThrow('newer version');
    expect(() => readBackup(JSON.stringify({ app: 'triathlon-tracker', version: 1, data: {} }))).toThrow('missing its settings');
  });

  it('skip a damaged workout rather than refusing the whole file', () => {
    const text = JSON.stringify({ app: 'triathlon-tracker', version: 1, data: { settings, activities: [run, { id: 'x' }, null] } });
    expect(readBackup(text).data.activities).toEqual([run]);
  });

  it('describe what they hold', () => {
    expect(describeBackup(data())).toBe('2 workouts and 1 day of health');
  });
});

describe('restoring', () => {
  it('adds back what the phone is missing and removes nothing', () => {
    const phone = data({ activities: [today], waterOverrides: {}, health: { '2026-11-16': { date: '2026-11-16', hrv: 55 } } });
    const restored = restoreInto(phone, data());
    expect(restored.activities.map((a) => a.id)).toEqual([today.id, swim.id, run.id]);
    expect(restored.waterOverrides).toEqual({ [swim.id]: true });
    expect(Object.keys(restored.health).sort()).toEqual(['2026-10-21', '2026-11-16']);
  });

  it("keeps the phone's copy where both have one, and takes the backup's plan changes and settings", () => {
    const phone = data({ activities: [{ ...run, name: 'Renamed' }], waterOverrides: { [swim.id]: false }, settings: { ...settings, maxHr: 185 } });
    const backup = data({ edits: { ...NO_EDITS, moves: { 'w1-tue-run': '2026-10-22' } }, settings: { ...settings, maxHr: 192 } });
    const restored = restoreInto(phone, backup);
    expect(restored.activities.find((a) => a.id === run.id)?.name).toBe('Renamed');
    expect(restored.waterOverrides[swim.id]).toBe(false);
    expect(restored.edits.moves).toEqual({ 'w1-tue-run': '2026-10-22' });
    expect(restored.settings.maxHr).toBe(192);
  });
});
