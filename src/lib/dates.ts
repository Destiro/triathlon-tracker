/** Local calendar date as YYYY-MM-DD. */
export const toKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Midnight local time on a YYYY-MM-DD date. */
export const fromKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number): Date => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

/** Monday of the week containing `d`, at midnight. */
export const startOfWeek = (d: Date): Date => {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(day, -((day.getDay() + 6) % 7));
};

/** Whole calendar days from `from` to `to` (positive if `to` is later), ignoring the time of day. */
export const daysBetween = (from: Date, to: Date): number => {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
};

export const isValidKey = (key: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toKey(fromKey(key)) === key;
};

/** "Mon 26 Oct". */
export const formatDay = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "26 Oct 2026". */
export const formatDate = (d: Date): string =>
  d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** "7:05 am" style time of day. */
export const formatTime = (d: Date): string => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
