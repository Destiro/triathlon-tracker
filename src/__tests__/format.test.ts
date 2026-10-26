import {
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatHours,
  formatPace,
  formatSpeed,
  formatSportDistance,
  formatSportPace,
  formatSwimPace,
  parseDistance,
  parseDuration,
  relativeDays,
} from '../lib/format';
import { addDays, daysBetween, fromKey, isValidKey, startOfWeek, toKey } from '../lib/dates';

describe('durations', () => {
  it('formats with and without hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('formats totals in hours and minutes', () => {
    expect(formatHours(0)).toBe('0m');
    expect(formatHours(45 * 60)).toBe('45m');
    expect(formatHours(5100)).toBe('1h 25m');
  });

  it.each([
    ['1:02:03', 3723],
    ['45:30', 2730],
    ['45', 2700],
    ['1.5', 90],
    ['1h 20m', 4800],
    ['90m', 5400],
    ['2h', 7200],
    ['30s', 30],
  ])('reads %s', (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds);
  });

  it('rejects nonsense', () => {
    for (const bad of ['', 'abc', '1:2:3:4', '10:75', '-5']) expect(parseDuration(bad)).toBeNull();
  });
});

describe('distances and paces', () => {
  it('formats distances in either unit system', () => {
    expect(formatDistance(10_250, 'metric')).toBe('10.25 km');
    expect(formatDistance(800, 'metric')).toBe('800 m');
    expect(formatDistance(999.7, 'metric')).toBe('1.00 km');
    expect(formatDistance(999.4, 'metric')).toBe('999 m');
    expect(formatDistance(1609.344, 'imperial')).toBe('1.00 mi');
    expect(formatSportDistance('swim', 1500, 'metric')).toBe('1500 m');
    expect(formatSportDistance('swim', 1500, 'imperial')).toBe('1640 yd');
  });

  it('formats pace, swim pace and speed', () => {
    expect(formatPace(1500, 5000, 'metric')).toBe('5:00 /km');
    expect(formatPace(1500, 5000, 'imperial')).toBe('8:03 /mi');
    expect(formatSwimPace(1800, 1000, 'metric')).toBe('3:00 /100m');
    expect(formatSpeed(3600, 30_000, 'metric')).toBe('30.0 km/h');
    expect(formatSpeed(3600, 30_000, 'imperial')).toBe('18.6 mph');
    expect(formatPace(0, 5000, 'metric')).toBe('--');
    expect(formatSpeed(100, 0, 'metric')).toBe('--');
  });

  it('picks the right measure for each sport', () => {
    expect(formatSportPace('run', 1500, 5000, 'metric')).toBe('5:00 /km');
    expect(formatSportPace('bike', 3600, 30_000, 'metric')).toBe('30.0 km/h');
    expect(formatSportPace('swim', 1800, 1000, 'metric')).toBe('3:00 /100m');
    expect(formatSportPace('strength', 1800, 0, 'metric')).toBe('--');
  });

  it('reads typed distances into metres', () => {
    expect(parseDistance('10.5', 'run', 'metric')).toBe(10_500);
    expect(parseDistance('10,5', 'run', 'metric')).toBe(10_500);
    expect(parseDistance('1', 'bike', 'imperial')).toBe(1609);
    expect(parseDistance('1500', 'swim', 'metric')).toBe(1500);
    expect(parseDistance('100', 'swim', 'imperial')).toBe(91);
    expect(parseDistance('', 'run', 'metric')).toBeNull();
    expect(parseDistance('-1', 'run', 'metric')).toBeNull();
    expect(distanceUnitLabel('swim', 'metric')).toBe('m');
    expect(distanceUnitLabel('run', 'imperial')).toBe('mi');
  });

  it('describes relative days', () => {
    expect(relativeDays(0)).toBe('Today');
    expect(relativeDays(1)).toBe('Tomorrow');
    expect(relativeDays(-1)).toBe('Yesterday');
    expect(relativeDays(12)).toBe('in 12 days');
    expect(relativeDays(-3)).toBe('3 days ago');
  });
});

describe('dates', () => {
  it('round-trips date keys and validates them', () => {
    expect(toKey(fromKey('2026-02-28'))).toBe('2026-02-28');
    expect(isValidKey('2026-02-30')).toBe(false);
    expect(isValidKey('2026-2-3')).toBe(false);
    expect(isValidKey('2026-12-31')).toBe(true);
  });

  it('finds Mondays and counts days across month ends', () => {
    expect(toKey(startOfWeek(new Date(2026, 10, 1)))).toBe('2026-10-26'); // Sunday 1 Nov
    expect(daysBetween(new Date(2026, 9, 30, 23), new Date(2026, 10, 2, 1))).toBe(3);
    expect(toKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
  });
});
