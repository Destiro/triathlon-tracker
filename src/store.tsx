import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, byDate, mergeActivities } from './activities';
import { addDays, fromKey, toKey } from './dates';
import { buildSchedule, Schedule } from './plan/schedule';
import { StravaError, StravaTokens, connect, fetchActivitiesSince, forgetTokens, loadTokens } from './strava';

export interface Settings {
  /** The Monday that plan week 1 starts on. */
  planStart: string;
  raceDate: string;
  raceName: string;
  /** Used to turn heart rate into training load. */
  maxHr: number;
  restHr: number;
}

const DEFAULT_SETTINGS: Settings = {
  planStart: '2026-10-19',
  raceDate: '2027-03-05',
  raceName: 'Ironman 70.3 New Zealand',
  maxHr: 190,
  restHr: 55,
};

const STORAGE_KEY = 'triathlon-tracker/v1';
// Look back a little on every sync so edits to recent activities come through.
const OVERLAP_DAYS = 3;

interface Saved {
  settings: Settings;
  activities: Activity[];
  lastSync: number | null;
  athlete: string;
}

interface Store {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  schedule: Schedule;
  activities: Activity[];
  activitiesByDate: Map<string, Activity[]>;
  connected: boolean;
  athlete: string;
  lastSync: number | null;
  syncing: boolean;
  /** A message to show, such as why the last sync failed. Cleared by the next successful one. */
  syncError: string | null;
  connectStrava: () => Promise<void>;
  disconnectStrava: () => Promise<void>;
  sync: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [athlete, setAthlete] = useState('');
  const [tokens, setTokens] = useState<StravaTokens | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Saved>;
          setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
          setActivities(saved.activities ?? []);
          setLastSync(saved.lastSync ?? null);
          setAthlete(saved.athlete ?? '');
        }
        setTokens(await loadTokens());
      } catch {
        // Unreadable save: start fresh rather than refusing to open.
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const saved: Saved = { settings, activities, lastSync, athlete };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved)).catch(() => {});
  }, [ready, settings, activities, lastSync, athlete]);

  const schedule = useMemo(
    () => buildSchedule(settings.planStart, settings.raceDate, settings.raceName),
    [settings.planStart, settings.raceDate, settings.raceName],
  );
  const activitiesByDate = useMemo(() => byDate(activities), [activities]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const runSync = useCallback(
    async (current: StravaTokens) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        // The first sync reaches back a week before the plan began, so the fitness curves have something to start from.
        const since = lastSync
          ? Math.floor(lastSync / 1000) - OVERLAP_DAYS * 86400
          : addDays(fromKey(settings.planStart), -7).getTime() / 1000;
        const incoming = await fetchActivitiesSince(current, since);
        setActivities((saved) => mergeActivities(saved, incoming));
        setLastSync(Date.now());
        setSyncError(null);
        // Tokens may have been renewed during the sync.
        setTokens((await loadTokens()) ?? current);
      } catch (e) {
        setSyncError(e instanceof StravaError ? e.message : 'Could not sync with Strava.');
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [lastSync, settings.planStart],
  );

  const sync = useCallback(async () => {
    if (tokens) await runSync(tokens);
  }, [tokens, runSync]);

  // Fetch new workouts whenever the app opens.
  const syncedOnOpen = useRef(false);
  useEffect(() => {
    if (ready && tokens && !syncedOnOpen.current) {
      syncedOnOpen.current = true;
      runSync(tokens);
    }
  }, [ready, tokens, runSync]);

  const connectStrava = useCallback(async () => {
    try {
      const result = await connect();
      if (!result) return;
      setTokens(result);
      setAthlete(result.athlete);
      setSyncError(null);
      syncedOnOpen.current = true;
      await runSync(result);
    } catch (e) {
      setSyncError(e instanceof StravaError ? e.message : 'Could not connect to Strava.');
    }
  }, [runSync]);

  const disconnectStrava = useCallback(async () => {
    await forgetTokens();
    setTokens(null);
    setAthlete('');
    setActivities([]);
    setLastSync(null);
    setSyncError(null);
  }, []);

  const value: Store = {
    ready,
    settings,
    updateSettings,
    schedule,
    activities,
    activitiesByDate,
    connected: tokens !== null,
    athlete,
    lastSync,
    syncing,
    syncError,
    connectStrava,
    disconnectStrava,
    sync,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}

/** Today's date key, which changes at midnight while the app is open. */
export function useTodayKey(): string {
  const [key, setKey] = useState(() => toKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setKey(toKey(new Date())), 60000);
    return () => clearInterval(timer);
  }, []);
  return key;
}
