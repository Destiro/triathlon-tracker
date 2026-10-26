import React, { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { FormModal } from '../components/modals';
import { Button, Card, Chip, Field, Segmented } from '../components/ui';
import { DATA_VERSION, EMPTY_DATA, migrate } from '../lib/migrate';
import { hasSamples, withoutSamples, withSamples } from '../lib/sample';
import { estimateMaxHr, hrZones } from '../lib/zones';
import { useStore } from '../store';
import { colors, spacing, type } from '../theme';

const POOLS = [
  { label: '25 m', metres: 25 },
  { label: '50 m', metres: 50 },
  { label: '25 yd', metres: 22.86 },
  { label: '33 m', metres: 33.33 },
];

const numberOrUndefined = (text: string) => {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

/** Your details and preferences, plus backup and reset. Mount it to open. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { settings, updateSettings, replaceAll } = store;
  const [name, setName] = useState(settings.name);
  const [maxHr, setMaxHr] = useState(settings.maxHr ? String(settings.maxHr) : '');
  const [restingHr, setRestingHr] = useState(settings.restingHr ? String(settings.restingHr) : '');
  const [age, setAge] = useState('');
  const [hours, setHours] = useState(String(Math.round((settings.weeklyTargetMin / 60) * 10) / 10));
  const [backup, setBackup] = useState('');

  const save = () => {
    const target = Number(hours.replace(',', '.'));
    updateSettings({
      name: name.trim(),
      maxHr: numberOrUndefined(maxHr),
      restingHr: numberOrUndefined(restingHr),
      weeklyTargetMin: Number.isFinite(target) && target > 0 ? Math.round(target * 60) : settings.weeklyTargetMin,
    });
    onClose();
  };

  const max = numberOrUndefined(maxHr);
  const zones = max ? hrZones(max, numberOrUndefined(restingHr)) : [];

  const exportData = () => {
    Share.share({ title: 'Triathlon Tracker backup', message: JSON.stringify(data) }).catch(() => {});
  };

  const restore = () => {
    try {
      const data = migrate(JSON.parse(backup));
      Alert.alert('Replace everything with this backup?', `It has ${data.workouts.length} workouts and ${data.races.length} races.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            replaceAll(data);
            onClose();
          },
        },
      ]);
    } catch {
      Alert.alert('That backup could not be read', 'Paste the whole backup text exactly as it was shared.');
    }
  };

  const { workouts, races, plan, gear } = store;
  const data = { version: DATA_VERSION, workouts, races, plan, gear, settings };
  const addSamples = () => {
    replaceAll(withSamples(data, new Date()));
    onClose();
  };
  const removeSamples = () => replaceAll(withoutSamples(data));

  const resetAll = () =>
    Alert.alert('Delete everything?', 'All workouts, races, plans, gear and settings will be removed. Export a backup first if you might want them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: () => {
          replaceAll(EMPTY_DATA);
          onClose();
        },
      },
    ]);


  return (
    <FormModal title="Settings" onClose={onClose} action={<Button label="Save" onPress={save} />}>
      <Field label="Your name" value={name} onChangeText={setName} placeholder="For the greeting on Today" />

      <Text style={type.label}>Units</Text>
      <Segmented
        options={[
          { value: 'metric', label: 'Kilometres' },
          { value: 'imperial', label: 'Miles' },
        ]}
        value={settings.units}
        onChange={(units) => updateSettings({ units })}
      />

      <Text style={type.label}>Pool length</Text>
      <View style={styles.wrap}>
        {POOLS.map((p) => (
          <Chip key={p.label} label={p.label} selected={Math.abs(settings.poolLengthM - p.metres) < 0.01} onPress={() => updateSettings({ poolLengthM: p.metres })} />
        ))}
      </View>

      <Field label="Weekly training target (hours)" value={hours} onChangeText={setHours} keyboardType="decimal-pad" hint="Shown on Today and as the line on your weekly chart." />

      <Card>
        <Text style={type.heading}>Heart rate</Text>
        <Text style={type.small}>Used for zones and to score how hard a workout was. Without it, your effort rating is used instead.</Text>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Max HR" value={maxHr} onChangeText={setMaxHr} keyboardType="number-pad" placeholder="e.g. 188" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Resting HR" value={restingHr} onChangeText={setRestingHr} keyboardType="number-pad" placeholder="e.g. 52" />
          </View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Don't know max? Your age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="e.g. 32" />
          </View>
          <Button
            label="Estimate"
            variant="quiet"
            onPress={() => {
              const a = numberOrUndefined(age);
              if (a && a >= 10 && a <= 100) setMaxHr(String(estimateMaxHr(a)));
            }}
            style={{ alignSelf: 'flex-end' }}
          />
        </View>
        {zones.length > 0 ? (
          <View style={{ gap: 4 }}>
            {zones.map((z) => (
              <View key={z.zone} style={styles.zone}>
                <Text style={[type.body, { width: 26, fontWeight: '700' }]}>Z{z.zone}</Text>
                <Text style={[type.body, { flex: 1 }]}>{z.name}</Text>
                <Text style={[type.body, { fontVariant: ['tabular-nums'] }]}>
                  {z.min}–{z.max} bpm
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Button label="Save settings" onPress={save} big />

      <Card>
        <Text style={type.heading}>Try it with sample data</Text>
        <Text style={type.small}>Adds six weeks of example training, a race and some gear, so every chart has something to show. Your own data is kept.</Text>
        {hasSamples(data) ? (
          <Button label="Remove sample data" variant="outline" onPress={removeSamples} />
        ) : (
          <Button label="Add sample data" variant="quiet" icon="flask-outline" onPress={addSamples} />
        )}
      </Card>

      <Card>
        <Text style={type.heading}>Backup</Text>
        <Text style={type.small}>Export everything as text to save in your notes or email. Paste it below to restore.</Text>
        <Button label="Export backup" variant="quiet" icon="export-variant" onPress={exportData} />
        <Field label="Restore from backup" value={backup} onChangeText={setBackup} placeholder="Paste a backup here" multiline />
        <Button label="Restore" variant="outline" onPress={restore} disabled={!backup.trim()} />
      </Card>

      <Button label="Delete all data" variant="danger" icon="trash-can-outline" onPress={resetAll} />
      <Text style={[type.small, { textAlign: 'center', color: colors.inkSoft }]}>Triathlon Tracker · data version {DATA_VERSION}</Text>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  zone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
