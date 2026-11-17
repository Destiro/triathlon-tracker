import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CHECKLIST, ChecklistState, progress } from '../checklist';
import { fromKey } from '../dates';
import { FormProjection } from '../projection';
import { formState } from '../stats';
import { colors, radius, spacing, type } from '../theme';
import { LineChart } from './charts';
import { Button, Card } from './ui';

const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Where form is heading by race day, if the rest of the plan is followed. */
export function FormCard({ projection }: { projection: FormProjection | null }) {
  if (!projection) {
    return (
      <Card title="Form on race day" note="If you follow the rest of the plan.">
        <Text style={type.body}>Not available yet. It starts from the workouts your watch has recorded, so once some have been read from Health Connect, and while the race is still to come, it shows here.</Text>
      </Card>
    );
  }
  const recent = projection.points.slice(-70);
  const labels = recent.map((p) => shortDate(p.date));
  const firstProjected = recent.findIndex((p) => p.projected);
  return (
    <Card title="Form on race day" note="If you follow the rest of the plan. Form is fitness minus fatigue: above zero you are fresher than you are tired.">
      <View style={styles.between}>
        <Text style={[type.number, { fontSize: 32 }]}>
          {projection.raceForm >= 0 ? '+' : ''}
          {Math.round(projection.raceForm)}
        </Text>
        <Text style={[type.small, { flex: 1, textAlign: 'right' }]}>
          Fitness {Math.round(projection.fitness)} · fatigue {Math.round(projection.fatigue)}
        </Text>
      </View>
      <Text style={type.body}>{formState(projection.raceForm)}</Text>
      <LineChart
        labels={labels}
        zeroLine
        series={[
          { label: 'Form so far', color: colors.success, values: recent.map((p) => (p.projected ? null : p.form)) },
          {
            label: 'Planned',
            color: colors.accent,
            dashed: true,
            values: recent.map((p, i) => (p.projected || i === firstProjected - 1 ? p.form : null)),
          },
        ]}
      />
      <Text style={type.small}>Assumes you train the planned sessions at your usual effort. Missed or added sessions change it.</Text>
    </Card>
  );
}

interface ChecklistProps {
  state: ChecklistState;
  onToggle: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}

function Item({ id, text, checked, onToggle, onRemove }: { id: string; text: string; checked: boolean; onToggle: (id: string) => void; onRemove?: (id: string) => void }) {
  return (
    <View style={styles.item}>
      <Pressable style={styles.itemMain} onPress={() => onToggle(id)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={text} hitSlop={4}>
        <MaterialCommunityIcons name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={checked ? colors.success : colors.inkFaint} />
        <Text style={[type.body, checked && styles.done]}>{text}</Text>
      </Pressable>
      {onRemove && (
        <Pressable onPress={() => onRemove(id)} accessibilityLabel={`Remove ${text}`} hitSlop={10}>
          <MaterialCommunityIcons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      )}
    </View>
  );
}

/** A tick list for race week, with room for your own items. */
export function ChecklistCard({ state, onToggle, onAdd, onRemove }: ChecklistProps) {
  const [text, setText] = useState('');
  const { done, total } = progress(state);
  const add = () => {
    onAdd(text);
    setText('');
  };
  return (
    <Card title="Race checklist" note={`${done} of ${total} ticked.`}>
      {CHECKLIST.map((g) => (
        <View key={g.title} style={{ gap: spacing.xs }}>
          <Text style={type.label}>{g.title}</Text>
          {g.items.map((i) => (
            <Item key={i.id} id={i.id} text={i.text} checked={!!state.done[i.id]} onToggle={onToggle} />
          ))}
        </View>
      ))}
      {state.extra.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text style={type.label}>Yours</Text>
          {state.extra.map((i) => (
            <Item key={i.id} id={i.id} text={i.text} checked={!!state.done[i.id]} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </View>
      )}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onSubmitEditing={add}
        placeholder="Add your own item"
        placeholderTextColor={colors.inkFaint}
        returnKeyType="done"
      />
      <Button label="Add" variant="quiet" onPress={add} disabled={text.trim() === ''} />
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  done: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
});
