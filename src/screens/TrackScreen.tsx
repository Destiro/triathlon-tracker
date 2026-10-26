import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp, useIsFocused, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteMap } from '../components/charts';
import { Button, Card, SportBadge, Stat } from '../components/ui';
import { WorkoutForm } from '../components/workouts';
import { formatDuration, formatPace, formatSpeed, formatSportDistance, formatSportPace, sportLabel } from '../lib/format';
import { MAX_ACCURACY_M, recentSpeed } from '../lib/geo';
import {
  ACTIVITIES,
  addFix,
  addLap,
  finish,
  legElapsed,
  LiveSession,
  nextLeg,
  pause,
  resume,
  startSession,
  toWorkout,
  totalElapsed,
  usesGps,
} from '../lib/session';
import { newId } from '../lib/workout';
import { TabParams } from '../navigation';
import { useStore } from '../store';
import { colors, radius, spacing, sportColors, type } from '../theme';
import { Workout } from '../types';

/** Where a session in progress is kept, so it survives the app being closed or reloaded. */
const LIVE_KEY = 'triathlon:live';

/** The current time. Only called from taps, timers and GPS callbacks, never while drawing the screen. */
const clock = () => Date.now();

type GpsState = { permission: 'unknown' | 'granted' | 'denied'; accuracy: number | null };

/** Keeps the screen on while mounted: the phone only shares GPS with an app that is on screen. */
function KeepAwake() {
  useKeepAwake('workout');
  return null;
}

/** Records a workout live: GPS for runs and rides, lengths for pool swims, a timer for everything. */
export default function TrackScreen() {
  const { settings, saveWorkout } = useStore();
  const route = useRoute<RouteProp<TabParams, 'Track'>>();
  const focused = useIsFocused();
  const [activityId, setActivityId] = useState('run');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [now, setNow] = useState(clock);
  const [gps, setGps] = useState<GpsState>({ permission: 'unknown', accuracy: null });
  const [review, setReview] = useState<Workout | null>(null);
  const restored = useRef(false);
  const units = settings.units;

  const activity = ACTIVITIES.find((a) => a.id === activityId) ?? ACTIVITIES[0];
  const active = session !== null && session.status !== 'finished';

  // Opened from another screen with an activity in mind (e.g. "Start a run" on Today). Each request carries a
  // timestamp, so asking for the same activity twice still selects it again.
  const request = route.params?.activity ? `${route.params.activity}:${route.params.at ?? ''}` : null;
  const [handledRequest, setHandledRequest] = useState<string | null>(null);
  if (request !== handledRequest) {
    setHandledRequest(request);
    const wanted = route.params?.activity;
    if (wanted && !active && ACTIVITIES.some((a) => a.id === wanted)) setActivityId(wanted);
  }

  // Bring back a session that was in progress when the app last closed, paused where it was saved.
  useEffect(() => {
    AsyncStorage.getItem(LIVE_KEY)
      .then((raw) => {
        if (!raw) return;
        const { session: saved, savedAt } = JSON.parse(raw) as { session: LiveSession; savedAt: number };
        if (saved && saved.status !== 'finished') setSession(pause(saved, savedAt));
      })
      .catch(() => {})
      .finally(() => {
        restored.current = true;
      });
  }, []);

  // Save the session as it goes: straight away when you pause, resume or change leg, and otherwise at most every
  // 10 seconds, since a long ride's route is too big to rewrite on every GPS point.
  const lastSave = useRef({ at: 0, key: '' });
  useEffect(() => {
    if (!restored.current) return;
    if (!active || !session) {
      lastSave.current = { at: 0, key: '' };
      AsyncStorage.removeItem(LIVE_KEY).catch(() => {});
      return;
    }
    const key = `${session.status}:${session.index}`;
    const at = clock();
    if (key === lastSave.current.key && at - lastSave.current.at < 10_000) return;
    lastSave.current = { at, key };
    AsyncStorage.setItem(LIVE_KEY, JSON.stringify({ session, savedAt: at })).catch(() => {});
  }, [session, active]);

  // Tick the clock while recording.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(clock()), 500);
    return () => clearInterval(timer);
  }, [active]);

  // GPS: on while choosing a GPS activity (to warm up) and throughout a session that has GPS legs.
  const needsGps = active ? session!.legs.some(usesGps) : focused && activity.legs.some(usesGps);
  useEffect(() => {
    if (!needsGps) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) {
        setGps({ permission: 'denied', accuracy: null });
        return;
      }
      setGps((g) => ({ ...g, permission: 'granted' }));
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
        (loc) => {
          setGps({ permission: 'granted', accuracy: loc.coords.accuracy ?? null });
          const fix = { lat: loc.coords.latitude, lon: loc.coords.longitude, alt: loc.coords.altitude ?? undefined, accuracy: loc.coords.accuracy };
          setSession((s) => (s ? addFix(s, fix, clock()) : s));
        },
      );
      if (cancelled) subscription.remove();
    })().catch((e) => console.warn('GPS failed to start', e));
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [needsGps]);

  // A buzz for every whole kilometre on a GPS leg.
  const leg = active ? session!.segments[session!.index] : null;
  const wholeKm = leg && usesGps(leg.sport) ? Math.floor(leg.distanceM / 1000) : 0;
  const lastKm = useRef(0);
  useEffect(() => {
    if (wholeKm > lastKm.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    lastKm.current = wholeKm;
  }, [wholeKm]);

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    lastKm.current = 0;
    setSession(startSession(activity.legs, clock(), settings.poolLengthM));
  };

  const complete = () => {
    if (!session) return;
    const at = clock();
    const workout = toWorkout(finish(session, at), at, newId());
    setSession(null);
    if (workout.segments.length === 0) {
      Alert.alert('Nothing to save', 'The workout was less than a second long.');
      return;
    }
    // Saved straight away, so closing the review can never lose it.
    saveWorkout(workout);
    setReview(workout);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const confirmFinish = () =>
    Alert.alert('Finish workout?', 'It will be saved to your log.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Finish', onPress: complete },
    ]);

  const confirmDiscard = () =>
    Alert.alert('Discard this workout?', 'Nothing will be saved.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setSession(null) },
    ]);

  const goNext = () => {
    if (!session) return;
    if (session.index >= session.legs.length - 1) return confirmFinish();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setSession(nextLeg(session, clock()));
  };

  const lap = (change: 1 | -1) => {
    Haptics.impactAsync(change > 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSession((s) => (s ? addLap(s, change) : s));
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {active && <KeepAwake />}
      {active && session && leg ? (
        <LiveView
          session={session}
          now={now}
          gps={gps}
          units={units}
          onPause={() => setSession(pause(session, clock()))}
          onResume={() => setSession(resume(session, clock()))}
          onNext={goNext}
          onFinish={confirmFinish}
          onDiscard={confirmDiscard}
          onLap={lap}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={type.title}>Track</Text>
          <Text style={type.small}>Choose an activity, then press start.</Text>
          <View style={styles.grid}>
            {ACTIVITIES.map((a) => {
              const selected = a.id === activityId;
              const color = a.legs.length > 1 ? sportColors.brick : sportColors[a.legs[0]];
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setActivityId(a.id)}
                  style={[styles.activity, selected && { borderColor: color, backgroundColor: `${color}14` }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.activityIcons}>
                    {a.legs
                      .filter((s) => s !== 'transition')
                      .map((s, i) => (
                        <SportBadge key={i} sport={s} size={28} />
                      ))}
                  </View>
                  <Text style={type.heading}>{a.label}</Text>
                  <Text style={type.small}>{a.description}</Text>
                </Pressable>
              );
            })}
          </View>

          {activity.legs.some(usesGps) ? <GpsStatus gps={gps} /> : null}
          {activity.legs.includes('swim') ? (
            <Text style={type.small}>
              Pool length is {settings.poolLengthM} m (change it in Settings). Tap the big button at the end of each length.
              {activity.legs.length > 1 ? ' For an open-water race swim, just let the timer run and fill in the distance afterwards.' : ''}
            </Text>
          ) : null}

          <Button label={`Start ${activity.label.toLowerCase()}`} icon="play" onPress={start} big />
          <Text style={[type.small, { textAlign: 'center' }]}>
            The screen stays on while you record. Keep the app open: your phone only gives GPS to the app on screen.
          </Text>
        </ScrollView>
      )}

      {review && (
        <WorkoutForm
          workout={review}
          heading="Nice work! Add some details"
          onClose={() => setReview(null)}
        />
      )}
    </SafeAreaView>
  );
}

function GpsStatus({ gps }: { gps: GpsState }) {
  if (gps.permission === 'denied') {
    return (
      <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }}>
        <Text style={type.heading}>Location is switched off for this app</Text>
        <Text style={type.body}>Distance and pace need your location. You can still record time without it.</Text>
        <Button label="Open settings" variant="outline" onPress={() => Linking.openSettings()} />
      </Card>
    );
  }
  const good = gps.accuracy !== null && gps.accuracy <= 15;
  const ok = gps.accuracy !== null && gps.accuracy <= MAX_ACCURACY_M;
  const color = good ? colors.success : ok ? colors.warning : colors.inkSoft;
  return (
    <View style={styles.gps} accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name={good ? 'crosshairs-gps' : 'crosshairs-question'} size={20} color={color} />
      <Text style={[type.body, { color }]}>
        {gps.accuracy === null
          ? 'Finding GPS… head outside for a quicker fix'
          : good
            ? `GPS ready (±${Math.round(gps.accuracy)} m)`
            : `Weak GPS (±${Math.round(gps.accuracy)} m), give it a moment`}
      </Text>
    </View>
  );
}

function LiveView({
  session,
  now,
  gps,
  units,
  onPause,
  onResume,
  onNext,
  onFinish,
  onDiscard,
  onLap,
}: {
  session: LiveSession;
  now: number;
  gps: GpsState;
  units: 'metric' | 'imperial';
  onPause: () => void;
  onResume: () => void;
  onNext: () => void;
  onFinish: () => void;
  onDiscard: () => void;
  onLap: (change: 1 | -1) => void;
}) {
  const leg = session.segments[session.index];
  const sport = leg.sport;
  const multi = session.legs.length > 1;
  const legSec = legElapsed(session, now) / 1000;
  const totalSec = totalElapsed(session, now) / 1000;
  const color = sportColors[sport];
  const paused = session.status === 'paused';
  const speed = usesGps(sport) ? recentSpeed(leg.points) : null;
  const current =
    speed && speed > 0.3
      ? sport === 'bike'
        ? formatSpeed(1, speed, units)
        : formatPace(1, speed, units)
      : '--';
  const nextSport = session.legs[session.index + 1];
  const transitionNumber = session.legs.slice(0, session.index + 1).filter((s) => s === 'transition').length;
  const legName = sport === 'transition' ? `T${transitionNumber}` : sportLabel(sport);

  return (
    <View style={styles.live}>
      <View style={[styles.liveHeader, { backgroundColor: color }]}>
        <SportBadge sport={sport} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.liveLeg}>{legName}</Text>
          {multi ? (
            <Text style={styles.liveSub}>
              Leg {session.index + 1} of {session.legs.length}
              {nextSport ? ` · next: ${nextSport === 'transition' ? 'transition' : sportLabel(nextSport).toLowerCase()}` : ' · last leg'}
            </Text>
          ) : null}
        </View>
        {paused ? <Text style={styles.pausedTag}>PAUSED</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.liveContent}>
        <Text style={[type.label, { textAlign: 'center' }]}>{multi ? 'Total time' : 'Time'}</Text>
        <Text style={[styles.clock, paused && { color: colors.inkSoft }]} accessibilityLabel={`Time ${formatDuration(totalSec)}`}>
          {formatDuration(totalSec)}
        </Text>

        <Card>
          <View style={styles.tiles}>
            {multi ? <Stat label={`${legName} time`} value={formatDuration(legSec)} align="center" /> : null}
            {sport !== 'strength' && sport !== 'transition' ? (
              <Stat label="Distance" value={leg.distanceM > 0 ? formatSportDistance(sport, leg.distanceM, units) : '0'} align="center" />
            ) : null}
            {usesGps(sport) || sport === 'swim' ? (
              <Stat label={sport === 'bike' ? 'Avg speed' : 'Avg pace'} value={formatSportPace(sport, legSec, leg.distanceM, units)} align="center" />
            ) : null}
          </View>
          {usesGps(sport) ? (
            <View style={styles.tiles}>
              <Stat label={sport === 'bike' ? 'Speed now' : 'Pace now'} value={current} align="center" />
              <Stat label="GPS" value={gps.accuracy === null ? '…' : `±${Math.round(gps.accuracy)} m`} align="center" />
            </View>
          ) : null}
        </Card>

        {sport === 'swim' ? (
          <View style={styles.lapArea}>
            <Pressable
              onPress={() => onLap(1)}
              disabled={paused}
              style={({ pressed }) => [styles.lapButton, { backgroundColor: color }, (pressed || paused) && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Count a length"
            >
              <Text style={styles.lapCount}>{leg.laps}</Text>
              <Text style={styles.lapLabel}>{leg.laps === 1 ? 'length' : 'lengths'} · tap to add</Text>
            </Pressable>
            <Button label="Undo a length" variant="quiet" icon="undo" onPress={() => onLap(-1)} disabled={leg.laps === 0} />
          </View>
        ) : null}

        {usesGps(sport) ? <RouteMap route={leg.points} height={180} color={color} /> : null}
      </ScrollView>

      <View style={styles.controls}>
        {multi ? (
          <Button
            label={nextSport ? `Start ${nextSport === 'transition' ? `T${transitionNumber + 1}` : sportLabel(nextSport).toLowerCase()}` : 'Finish race'}
            icon={nextSport ? 'skip-next' : 'flag-checkered'}
            onPress={onNext}
            big
          />
        ) : null}
        <View style={styles.controlRow}>
          {paused ? (
            <Button label="Resume" icon="play" onPress={onResume} big style={{ flex: 1 }} />
          ) : (
            <Button label="Pause" icon="pause" variant="quiet" onPress={onPause} big style={{ flex: 1 }} />
          )}
          <Button label="Finish" icon="stop" variant="danger" onPress={onFinish} big style={{ flex: 1 }} />
        </View>
        {paused ? (
          <Pressable onPress={onDiscard} hitSlop={8} style={{ alignSelf: 'center' }} accessibilityRole="button">
            <Text style={styles.discard}>Discard workout</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  activity: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 4,
  },
  activityIcons: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  gps: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  live: { flex: 1 },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  liveLeg: { fontSize: 22, fontWeight: '800', color: colors.white },
  liveSub: { fontSize: 13, color: colors.white, opacity: 0.9 },
  pausedTag: { color: colors.white, fontWeight: '800', letterSpacing: 1 },
  liveContent: { padding: spacing.lg, gap: spacing.md },
  clock: { fontSize: 72, fontWeight: '800', textAlign: 'center', color: colors.ink, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  lapArea: { gap: spacing.sm },
  lapButton: { borderRadius: radius.lg, paddingVertical: spacing.xxl, alignItems: 'center' },
  lapCount: { fontSize: 64, fontWeight: '800', color: colors.white, fontVariant: ['tabular-nums'] },
  lapLabel: { fontSize: 16, color: colors.white, fontWeight: '600' },
  controls: { padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  controlRow: { flexDirection: 'row', gap: spacing.md },
  discard: { color: colors.danger, fontWeight: '600', fontSize: 15 },
});
