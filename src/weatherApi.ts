import type { Place } from './settings';
import { DayWeather, parseForecast, parseGeocoding, parseMarine, placeKey, SeaDay, WeatherData } from './weather';

// Open-Meteo: free for personal use and needs no account or key. Each request sends only a latitude and longitude (or
// a place name to search for), never anything else about you.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_DAYS = 16;
// The marine forecast stops at about a week.
const MARINE_DAYS = 8;
const TIMEOUT_MS = 15000;

/** An error whose message is fine to show to the person using the app. */
export class WeatherError extends Error {}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new WeatherError('The weather service is not answering. Try again later.');
    return await response.json();
  } catch (e) {
    if (e instanceof WeatherError) throw e;
    throw new WeatherError(controller.signal.aborted ? 'The weather service took too long. Try again.' : "Can't reach the weather service. Check your connection.", { cause: e });
  } finally {
    clearTimeout(timer);
  }
}

/** Finds a town or beach by name. Null when nothing matches. */
export async function findPlace(name: string): Promise<Place | null> {
  const query = name.trim();
  if (!query) return null;
  return parseGeocoding(await getJson(`${GEOCODING}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`));
}

const forecastUrl = (p: Place) =>
  `${FORECAST}?latitude=${p.latitude}&longitude=${p.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&forecast_days=${FORECAST_DAYS}&timezone=auto`;

const marineUrl = (p: Place) =>
  `${MARINE}?latitude=${p.latitude}&longitude=${p.longitude}&hourly=sea_surface_temperature&daily=wave_height_max&forecast_days=${MARINE_DAYS}&timezone=auto`;

/** The forecast for the town, and the weather and sea at the beach. Whatever place is unset is left empty. */
export async function fetchWeather(home: Place | undefined, beach: Place | undefined, now = Date.now()): Promise<WeatherData> {
  const [homeDays, beachDays, sea] = await Promise.all([
    home ? getJson(forecastUrl(home)).then(parseForecast) : Promise.resolve([] as DayWeather[]),
    beach ? getJson(forecastUrl(beach)).then(parseForecast) : Promise.resolve([] as DayWeather[]),
    // A beach on a lake or too far inland has no marine data; that shouldn't stop the forecast.
    beach ? getJson(marineUrl(beach)).then(parseMarine).catch(() => [] as SeaDay[]) : Promise.resolve([] as SeaDay[]),
  ]);
  return { fetchedAt: now, homeKey: placeKey(home), beachKey: placeKey(beach), home: homeDays, beach: beachDays, sea };
}
