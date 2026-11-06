import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Activity, toActivity } from './activities';
import { histogramFromResponse } from './zones';

/** The Cloudflare Worker in worker/. The address isn't secret; the Strava client secret lives only on Cloudflare. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://triathlon-tracker-api.connordebruyn234.workers.dev';

const STRAVA_API = 'https://www.strava.com/api/v3';
const TOKEN_KEY = 'strava_tokens';
const PAGE_SIZE = 100;
const TIMEOUT_MS = 20000;
// Renew a little early so a token doesn't run out partway through a sync.
const EXPIRY_MARGIN_S = 120;

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds since 1970. */
  expiresAt: number;
  athlete: string;
}

/** An error whose message is fine to show to the person using the app. */
export class StravaError extends Error {}

/** Reads the tokens the Worker put on the app link at the end of sign-in. */
export function parseConnectRedirect(url: string): StravaTokens {
  return parseConnectParams(Linking.parse(url).queryParams ?? {});
}

/** The same, from query parameters that are already split out, as Expo Router hands them over. */
export function parseConnectParams(params: Record<string, unknown>): StravaTokens {
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : '');

  const error = get('error');
  if (error === 'denied') throw new StravaError('Strava access was not allowed.');
  if (error === 'scope') throw new StravaError('Tick "View data about your activities" so the app can see your workouts.');
  if (error) throw new StravaError('Strava sign-in failed. Try again.');

  const expiresAt = Number(get('expires_at'));
  if (!get('access_token') || !get('refresh_token') || !Number.isFinite(expiresAt)) {
    throw new StravaError('Strava sign-in failed. Try again.');
  }
  return { accessToken: get('access_token'), refreshToken: get('refresh_token'), expiresAt, athlete: get('athlete') };
}

export async function loadTokens(): Promise<StravaTokens | null> {
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StravaTokens;
  } catch {
    return null;
  }
}

export const saveTokens = (tokens: StravaTokens) => SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));

export const forgetTokens = () => SecureStore.deleteItemAsync(TOKEN_KEY);

/** Opens Strava's sign-in page and waits for it to come back to the app. Returns null if it was closed. */
export async function connect(): Promise<StravaTokens | null> {
  const redirect = Linking.createURL('strava-auth');
  const start = `${API_URL}/strava/connect?app_redirect=${encodeURIComponent(redirect)}`;
  const result = await WebBrowser.openAuthSessionAsync(start, redirect);
  if (result.type !== 'success') return null;
  const tokens = parseConnectRedirect(result.url);
  await saveTokens(tokens);
  return tokens;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new StravaError(controller.signal.aborted ? 'Strava took too long. Try again.' : "Can't reach Strava. Check your connection.", {
      cause: e,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Returns tokens that are good for a while yet, renewing them through the Worker when needed. */
async function freshTokens(tokens: StravaTokens): Promise<StravaTokens> {
  if (tokens.expiresAt - EXPIRY_MARGIN_S > Date.now() / 1000) return tokens;

  const response = await fetchWithTimeout(`${API_URL}/strava/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
  });
  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; expires_at?: number; error?: string }
    | null;
  if (!response.ok || !body?.access_token || !body.refresh_token || !body.expires_at) {
    throw new StravaError(body?.error ?? 'Could not renew the Strava sign-in. Try again later.');
  }
  const renewed = { ...tokens, accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: body.expires_at };
  await saveTokens(renewed);
  return renewed;
}

/** Every activity that started after `afterEpochS`, oldest pages first. Renews the sign-in if it has run out. */
export async function fetchActivitiesSince(tokens: StravaTokens, afterEpochS: number): Promise<Activity[]> {
  const fresh = await freshTokens(tokens);
  const activities: Activity[] = [];
  for (let page = 1; ; page++) {
    const url = `${STRAVA_API}/athlete/activities?after=${Math.floor(afterEpochS)}&per_page=${PAGE_SIZE}&page=${page}`;
    const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${fresh.accessToken}` } });
    if (response.status === 401) throw new StravaError('Strava sign-in has expired. Connect again in Settings.');
    if (response.status === 429) throw new StravaError('Strava is limiting requests. Try again in 15 minutes.');
    if (!response.ok) throw new StravaError('Strava is unavailable right now.');

    const list = (await response.json()) as Record<string, unknown>[];
    for (const raw of list) {
      const activity = toActivity(raw);
      if (activity) activities.push(activity);
    }
    if (list.length < PAGE_SIZE) return activities;
  }
}

/**
 * Seconds spent at each heart rate during one activity, from Strava's streams. Null when the activity has no heart
 * rate there (or can't be read), so it isn't asked for again. Throws when Strava is limiting requests or the sign-in
 * has run out, so the caller can stop and try again on the next sync.
 */
export async function fetchHeartRateHistogram(tokens: StravaTokens, activityId: number): Promise<Record<number, number> | null> {
  const fresh = await freshTokens(tokens);
  const url = `${STRAVA_API}/activities/${activityId}/streams?keys=time,heartrate&key_by_type=true`;
  const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${fresh.accessToken}` } });
  if (response.status === 401) throw new StravaError('Strava sign-in has expired. Connect again in Settings.');
  if (response.status === 429) throw new StravaError('Strava is limiting requests. Try again in 15 minutes.');
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new StravaError('Strava is unavailable right now.');
  return histogramFromResponse(await response.json().catch(() => null));
}
