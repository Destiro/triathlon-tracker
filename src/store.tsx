import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppData, DATA_VERSION, EMPTY_DATA, migrate } from './lib/migrate';
import { Gear, Race, Settings, TrainingPlan, Workout } from './types';

const STORAGE_KEY = 'triathlon:data';
const BACKUP_KEY = 'triathlon:backup';

interface StoreValue extends AppData {
  ready: boolean;
  saveWorkout: (workout: Workout) => void;
  deleteWorkout: (id: string) => void;
  saveRace: (race: Race) => void;
  deleteRace: (id: string) => void;
  setPlan: (plan: TrainingPlan | null) => void;
  saveGear: (gear: Gear) => void;
  deleteGear: (id: string) => void;
  updateSettings: (change: Partial<Settings>) => void;
  /** Replaces everything, e.g. from an imported backup. */
  replaceAll: (data: AppData) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Adds an item, or replaces the one with the same id. */
const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  // Turned off if we couldn't read what's on the phone, so we never overwrite it with an empty app.
  const canSave = useRef(true);

  useEffect(() => {
    (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(STORAGE_KEY);
      } catch (e) {
        console.warn('Could not read saved data', e);
        canSave.current = false;
      }
      if (raw) {
        try {
          setData(migrate(JSON.parse(raw)));
        } catch (e) {
          // Unreadable or from a newer app: keep a copy aside instead of losing it, then start fresh.
          console.warn('Saved data could not be understood', e);
          await AsyncStorage.setItem(BACKUP_KEY, raw).catch(() => {});
        }
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready || !canSave.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: DATA_VERSION })).catch((e) =>
      console.warn('Could not save data', e),
    );
  }, [ready, data]);

  const saveWorkout = useCallback((w: Workout) => setData((d) => ({ ...d, workouts: upsert(d.workouts, w) })), []);
  const deleteWorkout = useCallback((id: string) => setData((d) => ({ ...d, workouts: d.workouts.filter((w) => w.id !== id) })), []);
  const saveRace = useCallback((r: Race) => setData((d) => ({ ...d, races: upsert(d.races, r) })), []);
  const deleteRace = useCallback(
    (id: string) =>
      // A plan built for a deleted race has nothing to aim at, so it goes too.
      setData((d) => ({ ...d, races: d.races.filter((r) => r.id !== id), plan: d.plan?.raceId === id ? null : d.plan })),
    [],
  );
  const setPlan = useCallback((plan: TrainingPlan | null) => setData((d) => ({ ...d, plan })), []);
  const saveGear = useCallback((g: Gear) => setData((d) => ({ ...d, gear: upsert(d.gear, g) })), []);
  const deleteGear = useCallback(
    (id: string) =>
      setData((d) => ({
        ...d,
        gear: d.gear.filter((g) => g.id !== id),
        workouts: d.workouts.map((w) => (w.gearId === id ? { ...w, gearId: undefined } : w)),
      })),
    [],
  );
  const updateSettings = useCallback((change: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...change } })), []);
  const replaceAll = useCallback((next: AppData) => setData(next), []);

  const value = useMemo(
    () => ({ ...data, ready, saveWorkout, deleteWorkout, saveRace, deleteRace, setPlan, saveGear, deleteGear, updateSettings, replaceAll }),
    [data, ready, saveWorkout, deleteWorkout, saveRace, deleteRace, setPlan, saveGear, deleteGear, updateSettings, replaceAll],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
