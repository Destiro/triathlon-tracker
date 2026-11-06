import { formatDistance, formatRunPace, formatSpeed, formatSwimPace } from './format';
import { BestEffort } from './stats';

/** A best effort as a short figure: "1:58 /100m", "42.1 km", "310 m". */
export function bestValue(b: Pick<BestEffort, 'measure' | 'sport' | 'activity'>): string {
  const a = b.activity;
  if (b.measure === 'climb') return `${Math.round(a.elevationM)} m`;
  if (b.measure === 'distance') return formatDistance(a.distanceM, b.sport === 'swim');
  return b.sport === 'swim' ? formatSwimPace(a.avgSpeed) : b.sport === 'run' ? formatRunPace(a.avgSpeed) : formatSpeed(a.avgSpeed);
}
