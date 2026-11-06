import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, byDate, mergeActivities } from './activities';
import { addDays, fromKey, toKey } from './dates';
import { addSessions, applyEdits, NewSession, NO_EDITS, PlanEdits, removeSession, setMove } from './plan/edits';
import { buildSchedule, Schedule } from './plan/schedule';
import {
  StravaError,
  StravaTokens,
  connect,
  fetchActivitiesSince,
  fetchHeartRateHistogram,
  forgetTokens,
  loadTokens,
  parseConnectParams,
  saveTokens,
} from './strava';
import { wantsZones } from './zones';

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
// How many workouts get their heart rate breakdown fetched in one sync.
const ZONES_PER_SYNC = 15;

interface Saved {
  settings: Settings;
  activities: Activity[];
  lastSync: number | null;
  athlete: string;
  edits: PlanEdits;
  /** Swims you have corrected to pool (false) or open water (true), by activity id. */
  waterOverrides?: Record<string, boolean>;
}

interface Store {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** The plan on the calendar with your moves and added sessions applied. */
  schedule: Schedule;
  /** Move a plan workout to another day. `plannedDate` is the day the plan has it on, so moving it back clears the change. */
  moveWorkout: (id: string, to: string, plannedDate: string) => void;
  addSession: (input: NewSession) => void;
  /** Correct a swim that was called the wrong thing: pool (false) or open water (true). */
  setOpenWater: (activityId: number, open: boolean) => void;
  removeSession: (sessionId: string, scope: 'one' | 'later') => void;
  activities: Activity[];
  activitiesByDate: Map<string, Activity[]>;
  connected: boolean;
  athlete: string;
  lastSync: number | null;
  syncing: boolean;
  /** A message to show, such as why the last sync failed. Cleared by the next successful one. */
  syncError: string | null;
  connectStrava: () => Promise<void>;
  /** Completes sign-in from the query parameters of the `strava-auth` app link. */
  finishConnect: (params: Record<string, unknown>) => Promise<void>;
  disconnectStrava: () => Promise<void>;
  sync: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // As saved from Strava. `activities` below is the same with your pool / open water corrections applied.
  const [stored, setStored] = useState<Activity[]>([]);
  const [waterOverrides, setWaterOverrides] = useState<Record<string, boolean>>({});
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [athlete, setAthlete] = useState('');
  const [edits, setEdits] = useState<PlanEdits>(NO_EDITS);
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
          setStored(saved.activities ?? []);
          setWaterOverrides(saved.waterOverrides ?? {});
          setLastSync(saved.lastSync ?? null);
          setAthlete(saved.athlete ?? '');
          setEdits({ ...NO_EDITS, ...saved.edits });
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
    const saved: Saved = { settings, activities: stored, lastSync, athlete, edits, waterOverrides };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved)).catch(() => {});
  }, [ready, settings, stored, lastSync, athlete, edits, waterOverrides]);

  const schedule = useMemo(
    () => applyEdits(buildSchedule(settings.planStart, settings.raceDate, settings.raceName), edits),
    [settings.planStart, settings.raceDate, settings.raceName, edits],
  );

  const moveWorkout = useCallback((id: string, to: string, plannedDate: string) => setEdits((e) => setMove(e, id, to, plannedDate)), []);
  const addSession = useCallback(
    (input: NewSession) => setEdits((e) => addSessions(e, input, settings.raceDate, () => Math.random().toString(36).slice(2, 10))),
    [settings.raceDate],
  );
  const removeSessionById = useCallback((sessionId: string, scope: 'one' | 'later') => setEdits((e) => removeSession(e, sessionId, scope)), []);
  const activities = useMemo(
    () => stored.map((a) => (a.sport === 'swim' && waterOverrides[a.id] !== undefined ? { ...a, openWater: waterOverrides[a.id] } : a)),
    [stored, waterOverrides],
  );
  const activitiesByDate = useMemo(() => byDate(activities), [activities]);
  const setOpenWater = useCallback((id: number, open: boolean) => setWaterOverrides((o) => ({ ...o, [id]: open })), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  // Strava's heart rate zones are for subscribers only, so zones are worked out from the heart rate stream. That is one
  // request per activity and Strava allows 100 reads every 15 minutes, so each sync gets the newest few and stops
  // quietly if Strava says to slow down; the rest follow on later syncs.
  const zoneBudget = useRef(0);
  const fetchingZones = useRef(false);
  useEffect(() => {
    if (!tokens || fetchingZones.current || zoneBudget.current <= 0) return;
    const next = stored.find(wantsZones); // newest first
    if (!next) return;
    fetchingZones.current = true;
    zoneBudget.current -= 1;
    fetchHeartRateHistogram(tokens, next.id)
      .then((hr) => {
        fetchingZones.current = false;
        setStored((saved) => saved.map((x) => (x.id === next.id ? { ...x, hr: hr ?? {} } : x)));
      })
      .catch(() => {
        fetchingZones.current = false;
        zoneBudget.current = 0;
      });
  }, [tokens, stored]);

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
        setStored((saved) => mergeActivities(saved, incoming));
        zoneBudget.current = ZONES_PER_SYNC;
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

  const adoptTokens = useCallback(
    async (result: StravaTokens) => {
      setTokens(result);
      setAthlete(result.athlete);
      setSyncError(null);
      syncedOnOpen.current = true;
      await runSync(result);
    },
    [runSync],
  );

  const connectStrava = useCallback(async () => {
    try {
      const result = await connect();
      if (result) await adoptTokens(result);
    } catch (e) {
      setSyncError(e instanceof StravaError ? e.message : 'Could not connect to Strava.');
    }
  }, [adoptTokens]);

  // On Android the sign-in often comes back as a plain app link rather than through the browser session.
  const finishConnect = useCallback(
    async (params: Record<string, unknown>) => {
      try {
        const result = parseConnectParams(params);
        await saveTokens(result);
        await adoptTokens(result);
      } catch (e) {
        setSyncError(e instanceof StravaError ? e.message : 'Could not connect to Strava.');
      }
    },
    [adoptTokens],
  );

  const disconnectStrava = useCallback(async () => {
    await forgetTokens();
    setTokens(null);
    setAthlete('');
    setStored([]);
    setLastSync(null);
    setSyncError(null);
  }, []);

  const value: Store = {
    ready,
    settings,
    updateSettings,
    schedule,
    moveWorkout,
    addSession,
    removeSession: removeSessionById,
    setOpenWater,
    activities,
    activitiesByDate,
    connected: tokens !== null,
    athlete,
    lastSync,
    syncing,
    syncError,
    connectStrava,
    finishConnect,
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
