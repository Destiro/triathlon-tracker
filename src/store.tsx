import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, byDate } from './activities';
import { BackupData, BackupError, backupFileName, makeBackup, readBackup, restoreInto } from './backup';
import { pickBackup, shareBackup } from './backupFile';
import { addDays, fromKey, toKey } from './dates';
import * as healthConnect from './health/connect';
import { HealthByDate, mergeHealth } from './health/summary';
import { mergeWorkouts, needsReading } from './health/workouts';
import { addSessions, applyEdits, NewSession, NO_EDITS, PlanEdits, removeSession, setMove } from './plan/edits';
import { buildSchedule, Schedule } from './plan/schedule';

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
const DAY_MS = 86400000;
// Look back a little on every read so workouts edited or finished syncing late come through.
const OVERLAP_DAYS = 3;
// The first health read reaches back this far, so trends have a history from day one.
const HEALTH_HISTORY_DAYS = 120;

interface Saved {
  settings: Settings;
  /** Every workout, including the ones saved from Strava before the switch. Never cleared by the app. */
  activities: Activity[];
  /** When workouts were last read. */
  lastSync: number | null;
  /** Workouts have been read from Health Connect in full up to this time. Null until the first full read. */
  workoutCursor?: number | null;
  edits: PlanEdits;
  /** Swims you have corrected to pool (false) or open water (true), by activity id. */
  waterOverrides?: Record<string, boolean>;
  health?: HealthByDate;
  healthConnected?: boolean;
  lastHealthSync?: number | null;
  lastBackup?: number | null;
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
  /** When workouts were last read from Health Connect. */
  lastSync: number | null;
  syncing: boolean;
  /** A message to show, such as why the last workout read failed. Cleared by the next successful one. */
  syncError: string | null;
  /** False when Health Connect only lets the app read the last 30 days; null until the first read says. */
  pastDataAllowed: boolean | null;
  /** Reads new workouts and health data from Health Connect. */
  sync: () => Promise<void>;
  /** Sleep, VO2 max and heart rate from Health Connect, by the date you woke up. */
  health: HealthByDate;
  healthConnected: boolean;
  lastHealthSync: number | null;
  healthSyncing: boolean;
  healthError: string | null;
  /** Asks Health Connect for access (again), then reads. */
  connectHealth: () => Promise<void>;
  /** Stops reading. Everything already read stays on the phone. Access itself is managed in Health Connect. */
  disconnectHealth: () => void;
  lastBackup: number | null;
  /** Writes a backup file and opens the share sheet. Resolves to a message to show. */
  exportBackup: () => Promise<string>;
  /** Picks a backup file and restores it into what the phone has. Resolves to a message to show. */
  restoreBackup: () => Promise<string>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // As saved. `activities` below is the same with your pool / open water corrections applied.
  const [stored, setStored] = useState<Activity[]>([]);
  const [waterOverrides, setWaterOverrides] = useState<Record<string, boolean>>({});
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [workoutCursor, setWorkoutCursor] = useState<number | null>(null);
  const [edits, setEdits] = useState<PlanEdits>(NO_EDITS);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pastDataAllowed, setPastDataAllowed] = useState<boolean | null>(null);
  const syncingRef = useRef(false);
  const storedRef = useRef<Activity[]>([]);
  const [health, setHealth] = useState<HealthByDate>({});
  const [healthConnected, setHealthConnected] = useState(false);
  const [lastHealthSync, setLastHealthSync] = useState<number | null>(null);
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const healthSyncingRef = useRef(false);
  const [lastBackup, setLastBackup] = useState<number | null>(null);

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
          setWorkoutCursor(saved.workoutCursor ?? null);
          setEdits({ ...NO_EDITS, ...saved.edits });
          setHealth(saved.health ?? {});
          setHealthConnected(saved.healthConnected ?? false);
          setLastHealthSync(saved.lastHealthSync ?? null);
          setLastBackup(saved.lastBackup ?? null);
        }
      } catch {
        // Unreadable save: start fresh rather than refusing to open.
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const saved: Saved = {
      settings,
      activities: stored,
      lastSync,
      workoutCursor,
      edits,
      waterOverrides,
      health,
      healthConnected,
      lastHealthSync,
      lastBackup,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved)).catch(() => {});
  }, [ready, settings, stored, lastSync, workoutCursor, edits, waterOverrides, health, healthConnected, lastHealthSync, lastBackup]);

  // The workout read decides what to skip from what is saved at that moment, which the callback can't see as state.
  useEffect(() => {
    storedRef.current = stored;
  }, [stored]);

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

  const runWorkoutSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const now = Date.now();
      // The first read reaches back a week before the plan began, filling in anything Strava never had.
      const since = workoutCursor ? workoutCursor - OVERLAP_DAYS * DAY_MS : addDays(fromKey(settings.planStart), -7).getTime();
      const refreshAfter = now - OVERLAP_DAYS * DAY_MS;
      const result = await healthConnect.fetchWorkoutsSince(new Date(since).toISOString(), (session) =>
        needsReading(session, storedRef.current, refreshAfter),
      );
      setStored((saved) => mergeWorkouts(saved, result.activities));
      setLastSync(now);
      setPastDataAllowed(!result.clipped);
      // Move on only once everything back to `since` has been read; until then each read starts from the same place.
      if (result.complete && !result.clipped) setWorkoutCursor(now);
      setSyncError(result.complete ? null : 'Some workouts are still to come. Pull down in a few minutes to read the rest.');
    } catch (e) {
      setSyncError(e instanceof healthConnect.HealthError ? e.message : 'Could not read workouts from Health Connect.');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [workoutCursor, settings.planStart]);

  const runHealthSync = useCallback(async (since: number | null) => {
    if (healthSyncingRef.current) return;
    healthSyncingRef.current = true;
    setHealthSyncing(true);
    try {
      // Sleep is filed under the day you woke up, so look back a few days to finish nights that were still going.
      const from = since ? since - OVERLAP_DAYS * DAY_MS : addDays(new Date(), -HEALTH_HISTORY_DAYS).getTime();
      const incoming = await healthConnect.fetchHealthSince(new Date(from).toISOString());
      setHealth((saved) => mergeHealth(saved, incoming));
      setLastHealthSync(Date.now());
      setHealthError(null);
    } catch (e) {
      setHealthError(e instanceof healthConnect.HealthError ? e.message : 'Could not read from Health Connect.');
    } finally {
      healthSyncingRef.current = false;
      setHealthSyncing(false);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!healthConnected) return;
    await Promise.all([runWorkoutSync(), runHealthSync(lastHealthSync)]);
  }, [healthConnected, runWorkoutSync, runHealthSync, lastHealthSync]);

  // Read new workouts and health data whenever the app opens.
  const syncedOnOpen = useRef(false);
  useEffect(() => {
    if (ready && healthConnected && !syncedOnOpen.current) {
      syncedOnOpen.current = true;
      sync();
    }
  }, [ready, healthConnected, sync]);

  const connectHealth = useCallback(async () => {
    try {
      if (!(await healthConnect.connect())) {
        setHealthError('Allow at least exercise or sleep so the app has something to read. You can change this in Health Connect.');
        return;
      }
      setHealthConnected(true);
      setHealthError(null);
      setSyncError(null);
      syncedOnOpen.current = true;
      await Promise.all([runWorkoutSync(), runHealthSync(lastHealthSync)]);
    } catch (e) {
      setHealthError(e instanceof healthConnect.HealthError ? e.message : 'Could not connect to Health Connect.');
    }
  }, [runWorkoutSync, runHealthSync, lastHealthSync]);

  const disconnectHealth = useCallback(() => {
    setHealthConnected(false);
    setHealthError(null);
    setSyncError(null);
  }, []);

  const backupData = (): BackupData => ({ settings, activities: stored, edits, waterOverrides, health });

  const exportBackup = async (): Promise<string> => {
    try {
      const now = new Date();
      await shareBackup(makeBackup(backupData(), now), backupFileName(now));
      setLastBackup(now.getTime());
      return 'Backup made. Keep it somewhere off this phone, like Google Drive.';
    } catch (e) {
      return e instanceof BackupError ? e.message : 'Could not make the backup. Try again.';
    }
  };

  const restoreBackup = async (): Promise<string> => {
    try {
      const text = await pickBackup();
      if (text === null) return '';
      const { data } = readBackup(text);
      const restored = restoreInto(backupData(), data);
      setSettings({ ...DEFAULT_SETTINGS, ...restored.settings });
      setStored(restored.activities);
      setEdits(restored.edits);
      setWaterOverrides(restored.waterOverrides);
      setHealth(restored.health);
      const added = restored.activities.length - stored.length;
      return `Restored. ${added} workout${added === 1 ? '' : 's'} added back; nothing on the phone was removed.`;
    } catch (e) {
      return e instanceof BackupError ? e.message : 'Could not read that file. Try again.';
    }
  };

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
    lastSync,
    syncing,
    syncError,
    pastDataAllowed,
    sync,
    health,
    healthConnected,
    lastHealthSync,
    healthSyncing,
    healthError,
    connectHealth,
    disconnectHealth,
    lastBackup,
    exportBackup,
    restoreBackup,
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
