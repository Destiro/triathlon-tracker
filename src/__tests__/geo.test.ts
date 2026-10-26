import { acceptFix, elevationGain, haversine, pathDistance, projectRoute, routePaths, simplify, splits } from '../lib/geo';
import { GeoPoint } from '../types';

/** Exactly 1 km of latitude, as the distance formula measures it. */
const KM_LAT = 1000 / haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });

/** A straight run north from Wellington, one point every `stepM` metres at `secPerKm` pace. */
const straight = (km: number, stepM = 100, secPerKm = 300): GeoPoint[] =>
  Array.from({ length: (km * 1000) / stepM + 1 }, (_, i) => ({
    lat: -41.29 + (i * stepM * KM_LAT) / 1000,
    lon: 174.78,
    t: ((i * stepM) / 1000) * secPerKm * 1000,
  }));

describe('haversine and pathDistance', () => {
  it('measures known distances', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111_195, -1);
    expect(pathDistance(straight(5))).toBeCloseTo(5000, -1);
    expect(pathDistance([])).toBe(0);
  });

  it('does not count the jump after a pause', () => {
    const route = straight(2);
    const afterPause = route.slice(11).map((p, i) => (i === 0 ? { ...p, lon: p.lon + 0.01, brk: true } : { ...p, lon: p.lon + 0.01 }));
    const joined = [...route.slice(0, 11), ...afterPause];
    expect(pathDistance(joined)).toBeCloseTo(1900, -1);
    expect(routePaths(joined).map((p) => p.length)).toEqual([11, 10]);
  });
});

describe('acceptFix', () => {
  const a: GeoPoint = { lat: -41.29, lon: 174.78, t: 0 };

  it('drops inaccurate fixes and impossible jumps', () => {
    expect(acceptFix(undefined, { ...a, accuracy: 50 }, 'run')).toBe(false);
    expect(acceptFix(undefined, { ...a, accuracy: 8 }, 'run')).toBe(true);
    const farAndFast = { lat: a.lat + KM_LAT, lon: a.lon, t: 10_000 }; // 1 km in 10 s
    expect(acceptFix(a, farAndFast, 'run')).toBe(false);
    expect(acceptFix(a, farAndFast, 'bike')).toBe(false);
    const ride = { lat: a.lat + KM_LAT / 10, lon: a.lon, t: 10_000 }; // 100 m in 10 s = 36 km/h
    expect(acceptFix(a, ride, 'bike')).toBe(true);
    expect(acceptFix(a, ride, 'run')).toBe(true);
  });

  it('drops fixes that are not newer than the last one', () => {
    expect(acceptFix({ ...a, t: 5000 }, { ...a, t: 5000 }, 'run')).toBe(false);
  });
});

describe('splits', () => {
  it('gives one time per whole kilometre', () => {
    expect(splits(straight(3, 100, 300))).toEqual([300, 300, 300]);
    expect(splits(straight(2.5, 100, 240))).toEqual([240, 240]);
  });

  it('interpolates the crossing between points', () => {
    const route: GeoPoint[] = [
      { lat: 0, lon: 0, t: 0 },
      { lat: 2 * KM_LAT, lon: 0, t: 600_000 },
    ];
    expect(splits(route)).toEqual([300, 300]);
  });

  it('copes with nothing to split', () => {
    expect(splits([])).toEqual([]);
    expect(splits(straight(0.5))).toEqual([]);
  });
});

describe('elevationGain', () => {
  it('ignores small wobbles but counts real climbs', () => {
    const at = (alts: number[]) => alts.map((alt, i) => ({ lat: 0, lon: 0, t: i, alt }));
    expect(elevationGain(at([10, 12, 10, 12, 10]))).toBe(0);
    expect(elevationGain(at([10, 20, 15, 30]))).toBe(25);
    expect(elevationGain(at([]))).toBe(0);
  });
});

describe('simplify', () => {
  it('keeps a straight line to its ends and caps the size', () => {
    const route = straight(5, 10);
    expect(simplify(route)).toHaveLength(2);
    const zigzag = route.map((p, i) => ({ ...p, lon: p.lon + (i % 2 ? 0.001 : 0) }));
    expect(simplify(zigzag, 100).length).toBeLessThanOrEqual(100);
  });

  it('keeps pause breaks', () => {
    const first = straight(1, 10);
    const second = straight(1, 10).map((p, i) => ({ ...p, lon: p.lon + 0.01, brk: i === 0 ? true : undefined }));
    const result = simplify([...first, ...second]);
    expect(result.filter((p) => p.brk)).toHaveLength(1);
    expect(routePaths(result)).toHaveLength(2);
  });
});

describe('projectRoute', () => {
  it('fits the route in the box with north up', () => {
    const pts = projectRoute(straight(1), 100, 200, 10);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(190 + 1e-6);
    }
    expect(pts[0].y).toBeGreaterThan(pts[pts.length - 1].y); // heading north goes up the screen
    expect(projectRoute([], 10, 10)).toEqual([]);
  });
});
