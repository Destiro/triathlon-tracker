import { GeoPoint, Sport } from '../types';

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distance in metres between two positions, along the earth's surface. */
export function haversine(a: Pick<GeoPoint, 'lat' | 'lon'>, b: Pick<GeoPoint, 'lat' | 'lon'>): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fastest believable speed for each sport in metres per second. Faster jumps are GPS glitches. */
const MAX_SPEED: Partial<Record<Sport, number>> = { run: 12, bike: 30 };
const DEFAULT_MAX_SPEED = 30;

/** Fixes less accurate than this (metres) are ignored: phones report wild positions indoors or at a cold start. */
export const MAX_ACCURACY_M = 30;

export interface Fix extends GeoPoint {
  /** Reported accuracy in metres, if known. */
  accuracy?: number | null;
}

/**
 * Decides whether a new GPS fix should be used, given the last one kept. It is dropped if it is inaccurate,
 * older than the last, or would mean moving impossibly fast for the sport.
 */
export function acceptFix(previous: GeoPoint | undefined, fix: Fix, sport: Sport): boolean {
  if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return false;
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return false;
  if (!previous) return true;
  const seconds = (fix.t - previous.t) / 1000;
  if (seconds <= 0) return false;
  return haversine(previous, fix) / seconds <= (MAX_SPEED[sport] ?? DEFAULT_MAX_SPEED);
}

/** Distance covered along a series of positions. The jump into a point marked `brk` (after a pause) isn't counted. */
export function pathDistance(points: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) if (!points[i].brk) total += haversine(points[i - 1], points[i]);
  return total;
}

/** Splits a route into the stretches between pauses, for drawing each as its own line. */
export function routePaths(points: GeoPoint[]): GeoPoint[][] {
  const paths: GeoPoint[][] = [];
  for (const p of points) {
    if (p.brk || paths.length === 0) paths.push([]);
    paths[paths.length - 1].push(p);
  }
  return paths;
}

/**
 * Total climb in metres. Height from phone GPS jitters by a few metres, so a rise only counts once it has
 * built up past `threshold` from the last low point.
 */
export function elevationGain(points: GeoPoint[], threshold = 4): number {
  const heights = points.map((p) => p.alt).filter((a): a is number => a != null && Number.isFinite(a));
  if (heights.length < 2) return 0;
  let gain = 0;
  let base = heights[0];
  for (const h of heights.slice(1)) {
    if (h - base >= threshold) {
      gain += h - base;
      base = h;
    } else if (h < base) {
      base = h;
    }
  }
  return Math.round(gain);
}

/**
 * Seconds taken for each whole `splitM` (1 km by default) along the route, interpolating the moment each
 * boundary was crossed. Time spent paused should already be excluded by the caller.
 */
export function splits(points: GeoPoint[], splitM = 1000): number[] {
  const result: number[] = [];
  if (points.length < 2) return result;
  let covered = 0;
  let nextBoundary = splitM;
  let lastBoundaryT = points[0].t;
  for (let i = 1; i < points.length; i++) {
    const step = points[i].brk ? 0 : haversine(points[i - 1], points[i]);
    if (step <= 0) continue;
    // A millimetre of slack, so adding up many steps can't fall a rounding error short of a boundary.
    while (covered + step >= nextBoundary - 0.001) {
      const fraction = Math.min(1, (nextBoundary - covered) / step);
      const t = points[i - 1].t + fraction * (points[i].t - points[i - 1].t);
      result.push(Math.round((t - lastBoundaryT) / 1000));
      lastBoundaryT = t;
      nextBoundary += splitM;
    }
    covered += step;
  }
  return result;
}

/** Perpendicular distance in metres from p to the line a-b, on a local flat approximation. */
function offLine(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const scale = Math.cos(rad(a.lat)) * 111_320;
  const ax = a.lon * scale, ay = a.lat * 110_540;
  const bx = b.lon * scale, by = b.lat * 110_540;
  const px = p.lon * scale, py = p.lat * 110_540;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Thins a route for saving, keeping its shape (Ramer-Douglas-Peucker). Points within `toleranceM` of the
 * simplified line are dropped; the tolerance grows until the route fits in `maxPoints`.
 */
export function simplify(points: GeoPoint[], maxPoints = 500, toleranceM = 3): GeoPoint[] {
  if (points.length <= 2) return points;
  // Each stretch between pauses is thinned on its own, sharing the point budget, so breaks are kept.
  const paths = routePaths(points);
  if (paths.length > 1) {
    return paths.flatMap((path) => simplify(path, Math.max(2, Math.floor((maxPoints * path.length) / points.length)), toleranceM));
  }
  const run = (tol: number) => {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      let worst = -1;
      let worstDist = tol;
      for (let i = s + 1; i < e; i++) {
        const d = offLine(points[i], points[s], points[e]);
        if (d > worstDist) {
          worst = i;
          worstDist = d;
        }
      }
      if (worst >= 0) {
        keep[worst] = 1;
        stack.push([s, worst], [worst, e]);
      }
    }
    return points.filter((_, i) => keep[i]);
  };
  let tol = toleranceM;
  let result = run(tol);
  while (result.length > maxPoints && tol < 10_000) {
    tol *= 2;
    result = run(tol);
  }
  return result;
}

/**
 * Projects a route into a box `width` x `height` (with `pad` margin), keeping its proportions, for drawing
 * as an SVG polyline. North is up.
 */
export function projectRoute(points: Pick<GeoPoint, 'lat' | 'lon'>[], width: number, height: number, pad = 8): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const midLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const kx = Math.cos(rad(midLat));
  const xs = points.map((p) => p.lon * kx);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return points.map((_, i) => ({ x: offX + (xs[i] - minX) * scale, y: height - (offY + (ys[i] - minY) * scale) }));
}

/**
 * Speed in metres per second over roughly the last `windowMs` of moving time, for a "current pace" readout
 * that reacts to how you're going now rather than the whole workout. Null until there is enough to measure.
 */
export function recentSpeed(points: GeoPoint[], windowMs = 30_000): number | null {
  if (points.length < 2) return null;
  const end = points[points.length - 1];
  let i = points.length - 1;
  while (i > 0 && end.t - points[i - 1].t <= windowMs && !points[i].brk) i--;
  const window = points.slice(i);
  const ms = end.t - window[0].t;
  if (window.length < 2 || ms < 5_000) return null;
  return pathDistance(window) / (ms / 1000);
}
