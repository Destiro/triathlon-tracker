/** 45 → "45 min", 75 → "1 h 15", 120 → "2 h". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

/** A stopwatch time: 2710 → "45:10", 4510 → "1:15:10". */
export function formatClock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** 1300 → "1,300 m", 21100 → "21.1 km". Swims stay in metres. */
export function formatDistance(metres: number, inMetres = false): string {
  if (inMetres || metres < 1000) return `${Math.round(metres).toLocaleString()} m`;
  return `${(metres / 1000).toFixed(metres >= 100000 ? 0 : 1)} km`;
}

/** Running pace per km from metres per second: "5:12 /km". */
export const formatRunPace = (speed: number): string => (speed > 0 ? `${formatClock(1000 / speed)} /km` : '–');

/** Swimming pace per 100 m: "2:05 /100m". */
export const formatSwimPace = (speed: number): string => (speed > 0 ? `${formatClock(100 / speed)} /100m` : '–');

/** Riding speed: "28.4 km/h". */
export const formatSpeed = (speed: number): string => `${(speed * 3.6).toFixed(1)} km/h`;

/** "just now", "5 min ago", "3 h ago", or a date. */
export function formatAgo(timestamp: number, now = Date.now()): string {
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
