import { DEFAULT_SETTINGS } from '../settings';
import { byDay, describeCode, isOutdoor, openWaterCall, outdoorCall, parseForecast, parseGeocoding, parseMarine, placeKey, wetsuitAdvice } from '../weather';
import { fetchWeather, findPlace, WeatherError } from '../weatherApi';

const limits = { rainLimit: 40, windLimit: 30, waveLimit: 1, wetsuitBelow: 20 };
const day = (over = {}) => ({ date: '2026-11-16', code: 1, maxC: 21, minC: 14, rainPct: 10, windKmh: 12, ...over });

describe('parsing Open-Meteo answers', () => {
  it('reads a place search, with the region to tell towns apart', () => {
    const json = { results: [{ name: 'Mount Maunganui', latitude: -37.64, longitude: 176.19, admin1: 'Bay of Plenty', country: 'New Zealand' }] };
    expect(parseGeocoding(json)).toEqual({ name: 'Mount Maunganui, Bay of Plenty', latitude: -37.64, longitude: 176.19 });
  });

  it('gives null when nothing matched or the answer is not a place', () => {
    expect(parseGeocoding({ generationtime_ms: 0.1 })).toBeNull();
    expect(parseGeocoding({ results: [] })).toBeNull();
    expect(parseGeocoding({ results: [{ name: 'x' }] })).toBeNull();
    expect(parseGeocoding(null)).toBeNull();
  });

  it('reads the daily forecast', () => {
    const json = {
      daily: {
        time: ['2026-11-15', '2026-11-16'],
        weather_code: [51, 2],
        temperature_2m_max: [21, 22.5],
        temperature_2m_min: [13.6, 15.6],
        precipitation_probability_max: [49, 39],
        wind_speed_10m_max: [11.7, 14.9],
      },
    };
    expect(parseForecast(json)).toEqual([
      { date: '2026-11-15', code: 51, maxC: 21, minC: 13.6, rainPct: 49, windKmh: 11.7 },
      { date: '2026-11-16', code: 2, maxC: 22.5, minC: 15.6, rainPct: 39, windKmh: 14.9 },
    ]);
  });

  it('skips days without a temperature and copes with missing or malformed answers', () => {
    expect(parseForecast({ daily: { time: ['2026-11-15', '2026-11-16'], temperature_2m_max: [null, 20] } }).map((d) => d.date)).toEqual(['2026-11-16']);
    expect(parseForecast({})).toEqual([]);
    expect(parseForecast('nope')).toEqual([]);
  });

  it('averages the hourly sea temperature for each day and takes the biggest wave', () => {
    const json = {
      hourly: { time: ['2026-11-15T00:00', '2026-11-15T01:00', '2026-11-16T00:00'], sea_surface_temperature: [17, 18, 19] },
      daily: { time: ['2026-11-15', '2026-11-16'], wave_height_max: [0.7, 0.92] },
    };
    expect(parseMarine(json)).toEqual([
      { date: '2026-11-15', seaC: 17.5, waveM: 0.7 },
      { date: '2026-11-16', seaC: 19, waveM: 0.92 },
    ]);
    expect(parseMarine({})).toEqual([]);
  });

  it('keeps days by date', () => {
    expect(byDay([day(), day({ date: '2026-11-17' })])['2026-11-17'].date).toBe('2026-11-17');
  });
});

describe('describeCode', () => {
  it('names the common weather, and covers every code', () => {
    expect(describeCode(0)).toEqual({ icon: 'weather-sunny', label: 'Clear' });
    expect(describeCode(2).label).toBe('Partly cloudy');
    expect(describeCode(63).label).toBe('Rain');
    expect(describeCode(65).label).toBe('Heavy rain');
    expect(describeCode(95).label).toBe('Thunderstorms');
    for (let c = 0; c < 100; c++) expect(describeCode(c).icon).toMatch(/^weather-/);
  });
});

describe('the calls', () => {
  it('says good outside on a dry, calm day', () => {
    expect(outdoorCall(day(), limits)).toEqual({ ok: true, reasons: [] });
  });

  it('says think indoor for rain, wind or thunder, with the reasons', () => {
    expect(outdoorCall(day({ rainPct: 70 }), limits).reasons).toEqual(['70% chance of rain']);
    expect(outdoorCall(day({ windKmh: 34.4 }), limits).reasons).toEqual(['wind to 34 km/h']);
    expect(outdoorCall(day({ code: 95, rainPct: 80, windKmh: 40 }), limits)).toEqual({
      ok: false,
      reasons: ['thunderstorms', '80% chance of rain', 'wind to 40 km/h'],
    });
  });

  it('treats a limit as the most that is fine', () => {
    expect(outdoorCall(day({ rainPct: 40, windKmh: 30 }), limits).ok).toBe(true);
    expect(outdoorCall(day({ rainPct: 41 }), limits).ok).toBe(false);
  });

  it('ignores rain for an ocean swim, but not waves, wind or lightning', () => {
    const sea = { date: '2026-11-16', seaC: 17, waveM: 0.6 };
    expect(openWaterCall(day({ rainPct: 90 }), sea, limits)).toEqual({ ok: true, reasons: [] });
    expect(openWaterCall(day(), { ...sea, waveM: 1.4 }, limits)?.reasons).toEqual(['waves to 1.4 m']);
    expect(openWaterCall(day({ windKmh: 35 }), sea, limits)?.reasons).toEqual(['wind to 35 km/h']);
    expect(openWaterCall(day({ code: 96 }), sea, limits)?.reasons).toEqual(['thunderstorms']);
  });

  it('works from the sea alone or the weather alone, and is null with neither', () => {
    expect(openWaterCall(undefined, { date: 'x', seaC: 17, waveM: 2 }, limits)?.ok).toBe(false);
    expect(openWaterCall(day(), undefined, limits)?.ok).toBe(true);
    expect(openWaterCall(undefined, undefined, limits)).toBeNull();
  });

  it('says whether to wear a wetsuit', () => {
    expect(wetsuitAdvice(17.5, limits)).toBe('Wetsuit on: the sea is under 20°.');
    expect(wetsuitAdvice(21, limits)).toBe('Wetsuit optional: the sea is warm.');
    expect(wetsuitAdvice(null, limits)).toBeNull();
  });

  it('counts rides, runs, bricks and races as outdoor and leaves swims and gym', () => {
    expect(['bike', 'run', 'brick', 'race'].every(isOutdoor)).toBe(true);
    expect(['swim', 'gym'].some(isOutdoor)).toBe(false);
  });

  it('starts with limits that suit the app', () => {
    expect(DEFAULT_SETTINGS).toMatchObject(limits);
  });

  it('names a place by where it is, so a forecast for somewhere else can be told apart', () => {
    expect(placeKey({ name: 'A', latitude: -36.851, longitude: 174.764 })).toBe('-36.85,174.76');
    expect(placeKey(undefined)).toBe('');
  });
});

describe('asking Open-Meteo', () => {
  const answers = (urls: Record<string, unknown>) =>
    jest.fn(async (url: string) => {
      const hit = Object.keys(urls).find((k) => url.startsWith(k));
      if (!hit) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => urls[hit] };
    });
  const forecast = { daily: { time: ['2026-11-16'], weather_code: [1], temperature_2m_max: [21], temperature_2m_min: [14], precipitation_probability_max: [10], wind_speed_10m_max: [12] } };
  const marine = { hourly: { time: ['2026-11-16T00:00'], sea_surface_temperature: [17] }, daily: { time: ['2026-11-16'], wave_height_max: [0.6] } };
  const home = { name: 'Home', latitude: -36.85, longitude: 174.76 };
  const beach = { name: 'Beach', latitude: -37.64, longitude: 176.19 };

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('fetches the town and the beach and the sea, and sends only coordinates', async () => {
    const fetchMock = answers({ 'https://api.open-meteo.com/': forecast, 'https://marine-api.open-meteo.com/': marine });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    const data = await fetchWeather(home, beach, 1000);
    expect(data).toMatchObject({ fetchedAt: 1000, homeKey: '-36.85,174.76', beachKey: '-37.64,176.19' });
    expect(data.home).toHaveLength(1);
    expect(data.beach).toHaveLength(1);
    expect(data.sea).toEqual([{ date: '2026-11-16', seaC: 17, waveM: 0.6 }]);
    for (const [url] of fetchMock.mock.calls) expect(url).not.toMatch(/Home|Beach/);
  });

  it('does not ask for a place that is not set', async () => {
    const fetchMock = answers({ 'https://api.open-meteo.com/': forecast });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    const data = await fetchWeather(home, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.beach).toEqual([]);
    expect(data.sea).toEqual([]);
  });

  it('still gives the forecast when the beach has no sea data', async () => {
    (globalThis as { fetch?: unknown }).fetch = answers({ 'https://api.open-meteo.com/': forecast });
    const data = await fetchWeather(home, beach);
    expect(data.beach).toHaveLength(1);
    expect(data.sea).toEqual([]);
  });

  it('finds a place by name, and says so in words when the service is down', async () => {
    (globalThis as { fetch?: unknown }).fetch = answers({ 'https://geocoding-api.open-meteo.com/': { results: [{ name: 'Taupō', latitude: -38.68, longitude: 176.07, country: 'New Zealand' }] } });
    expect(await findPlace('taupo')).toMatchObject({ name: 'Taupō, New Zealand' });
    expect(await findPlace('   ')).toBeNull();

    (globalThis as { fetch?: unknown }).fetch = answers({});
    await expect(findPlace('taupo')).rejects.toThrow(WeatherError);
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(findPlace('taupo')).rejects.toThrow('Check your connection');
  });
});
