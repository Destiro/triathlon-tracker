import { formatClock, formatHoursMinutes, formatDistance, formatMinutes, formatRunPace, formatSwimPace } from '../format';

describe('format', () => {
  it('writes minutes the way the plan does', () => {
    expect([formatMinutes(45), formatMinutes(75), formatMinutes(120), formatMinutes(185)]).toEqual(['45 min', '1 h 15', '2 h', '3 h 05']);
  });

  it('writes stopwatch times', () => {
    expect([formatClock(65), formatClock(2710), formatClock(4510)]).toEqual(['1:05', '45:10', '1:15:10']);
  });

  it('keeps swims in metres and long distances in kilometres', () => {
    expect([formatDistance(1300, true), formatDistance(21100), formatDistance(90000), formatDistance(800)]).toEqual([
      '1,300 m',
      '21.1 km',
      '90.0 km',
      '800 m',
    ]);
  });

  it('turns speed into pace per km for runs and per 100 m for swims', () => {
    expect(formatRunPace(1000 / 312)).toBe('5:12 /km');
    expect(formatSwimPace(100 / 125)).toBe('2:05 /100m');
  });
});

describe('formatHoursMinutes', () => {
  it('writes a finish time as hours and minutes, rounded to the nearest minute', () => {
    expect([formatHoursMinutes(24120), formatHoursMinutes(24149), formatHoursMinutes(24151), formatHoursMinutes(3540)]).toEqual(['6:42', '6:42', '6:43', '0:59']);
  });

  it('carries into the next hour when rounding up', () => {
    expect(formatHoursMinutes(7170)).toBe('2:00');
  });
});
