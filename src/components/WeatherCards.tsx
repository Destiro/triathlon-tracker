import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatAgo } from '../format';
import { PlannedWorkout } from '../plan/types';
import { Place } from '../settings';
import { colors, radius, spacing, type } from '../theme';
import { Call, DayWeather, describeCode, isOutdoor, Limits, openWaterCall, outdoorCall, SeaDay, wetsuitAdvice } from '../weather';
import { Button, Card } from './ui';

const chipStyle = (ok: boolean) => ({ color: ok ? colors.success : colors.warning, backgroundColor: ok ? colors.successSoft : colors.warningSoft });

/** "Good outside" or "Think indoor", with the reasons when it is not. */
function Verdict({ call, good, bad }: { call: Call; good: string; bad: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={[styles.chip, chipStyle(call.ok)]}>{call.ok ? good : bad}</Text>
      {!call.ok && <Text style={type.small}>{call.reasons.join(', ')}.</Text>}
    </View>
  );
}

function Summary({ day }: { day: DayWeather }) {
  const info = describeCode(day.code);
  return (
    <View style={styles.summary}>
      <MaterialCommunityIcons name={info.icon as never} size={32} color={colors.accent} accessibilityLabel={info.label} />
      <View style={{ flex: 1 }}>
        <Text style={type.body}>
          {info.label} · {Math.round(day.maxC)}° / {Math.round(day.minC)}°
        </Text>
        <Text style={type.small}>
          {Math.round(day.rainPct)}% chance of rain · wind to {Math.round(day.windKmh)} km/h
        </Text>
      </View>
    </View>
  );
}

/** Weather for the day, with a call on each ride and run: worth doing outside, or better on the trainer or treadmill. */
export function DayWeatherCard({ day, workouts, limits, updatedAt }: { day: DayWeather | undefined; workouts: PlannedWorkout[]; limits: Limits; updatedAt: number }) {
  const outside = workouts.filter((w) => isOutdoor(w.kind));
  if (!day || outside.length === 0) return null;
  return (
    <Card title="Weather" note={`Forecast updated ${formatAgo(updatedAt)}. The limits for "think indoor" are in Settings.`}>
      <Summary day={day} />
      {outside.map((w, i) => (
        <View key={i} style={styles.line}>
          <Text style={[type.body, { flex: 1 }]}>{w.title}</Text>
          <Verdict call={outdoorCall(day, limits)} good="Good outside" bad="Think indoor" />
        </View>
      ))}
    </Card>
  );
}

/** Sea temperature, waves and wind at your beach on a day with a swim, and whether it is worth it. */
export function OceanSwimCard({
  place,
  weather,
  sea,
  limits,
}: {
  place: Place;
  weather: DayWeather | undefined;
  sea: SeaDay | undefined;
  limits: Limits;
}) {
  const call = openWaterCall(weather, sea, limits);
  if (!call) return null;
  const advice = wetsuitAdvice(sea?.seaC ?? null, limits);
  return (
    <Card title="Ocean swim" note={place.name}>
      <Verdict call={call} good="Good for open water" bad="Think pool" />
      <View style={styles.facts}>
        {sea?.seaC != null && <Fact label="Sea" value={`${sea.seaC.toFixed(1)}°`} />}
        {sea?.waveM != null && <Fact label="Waves" value={`${sea.waveM.toFixed(1)} m`} />}
        {weather && <Fact label="Wind" value={`${Math.round(weather.windKmh)} km/h`} />}
        {weather && <Fact label="Air" value={`${Math.round(weather.maxC)}°`} />}
      </View>
      {advice && <Text style={type.body}>{advice}</Text>}
      {!sea && <Text style={type.small}>The sea forecast only reaches about a week ahead.</Text>}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** A box to type a town or beach into, with a button that looks it up and saves it. */
export function PlaceField({
  label,
  place,
  hint,
  onFind,
  onClear,
}: {
  label: string;
  place: Place | undefined;
  hint: string;
  onFind: (name: string) => Promise<string>;
  onClear: () => void;
}) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const find = async () => {
    setBusy(true);
    setMessage(await onFind(text));
    setBusy(false);
    setText('');
  };
  return (
    <View style={{ gap: 4 }}>
      <Text style={type.label}>{label}</Text>
      {place ? <Text style={type.body}>{place.name}</Text> : <Text style={type.small}>{hint}</Text>}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onSubmitEditing={find}
        placeholder={place ? 'Change it: type a town' : 'Type a town'}
        placeholderTextColor={colors.inkFaint}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={label}
      />
      <Button label={busy ? 'Looking…' : 'Find it'} variant="quiet" onPress={find} disabled={busy || text.trim() === ''} />
      {place && <Button label="Remove" variant="quiet" onPress={onClear} />}
      {message !== '' && <Text style={type.small}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  chip: { fontSize: 12, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill, overflow: 'hidden', alignSelf: 'flex-start' },
  facts: { flexDirection: 'row', gap: spacing.xl, flexWrap: 'wrap' },
  value: { fontSize: 15, fontWeight: '700', color: colors.ink, fontFamily: 'monospace' },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
});
