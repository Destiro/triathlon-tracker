import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { fromKey } from '../dates';
import { NewSession } from '../plan/edits';
import { daysOfWeek, Schedule, TOTAL_WEEKS } from '../plan/schedule';
import { colors, radius, spacing, type } from '../theme';
import { colorOf, tintOf } from './sport';
import { Button } from './ui';

const shortDay = (key: string) => fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

interface DayPickerProps {
  schedule: Schedule;
  week: number;
  onWeek: (week: number) => void;
  selected?: string;
  /** A day that can't be picked, such as where the workout already is. */
  current?: string;
  onSelect: (date: string) => void;
}

/** One plan week as a list of days with what is on each, and arrows to go to the weeks either side. */
function DayPicker({ schedule, week, onWeek, selected, current, onSelect }: DayPickerProps) {
  const days = daysOfWeek(schedule, week);
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.weekRow}>
        <Pressable onPress={() => onWeek(week - 1)} disabled={week <= 1} hitSlop={12} accessibilityLabel="Previous week">
          <MaterialCommunityIcons name="chevron-left" size={30} color={week <= 1 ? colors.inkFaint : colors.accent} />
        </Pressable>
        <Text style={type.heading}>
          Week {week}
          {days.length > 0 ? ` · ${fromKey(days[0].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
        </Text>
        <Pressable onPress={() => onWeek(week + 1)} disabled={week >= TOTAL_WEEKS} hitSlop={12} accessibilityLabel="Next week">
          <MaterialCommunityIcons name="chevron-right" size={30} color={week >= TOTAL_WEEKS ? colors.inkFaint : colors.accent} />
        </Pressable>
      </View>
      {days.map((d) => {
        const isRace = d.workouts.some((w) => w.kind === 'race');
        const blocked = d.date === current || isRace;
        return (
          <Pressable
            key={d.date}
            disabled={blocked}
            onPress={() => onSelect(d.date)}
            style={[styles.day, d.date === selected && styles.daySelected, blocked && { opacity: 0.45 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: d.date === selected, disabled: blocked }}
            accessibilityLabel={shortDay(d.date)}
          >
            <Text style={styles.dayName}>{shortDay(d.date)}</Text>
            <View style={styles.tags}>
              {d.workouts.length === 0 ? (
                <Text style={type.small}>Rest</Text>
              ) : (
                d.workouts.map((w, i) => (
                  <View key={i} style={[styles.tag, { borderLeftColor: colorOf(w.kind), backgroundColor: tintOf(w.kind) }]}>
                    <Text style={styles.tagText} numberOfLines={1}>
                      {w.title}
                    </Text>
                  </View>
                ))
              )}
            </View>
            {d.date === current && <Text style={type.small}>Here now</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={type.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={26} color={colors.inkSoft} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

interface MoveProps {
  visible: boolean;
  workoutTitle: string;
  schedule: Schedule;
  /** The day the workout is on now. */
  currentDate: string;
  onMove: (date: string) => void;
  onClose: () => void;
}

/** Pick another day for a workout. */
export function MoveSheet({ visible, workoutTitle, schedule, currentDate, onMove, onClose }: MoveProps) {
  const [week, setWeek] = useState(schedule.get(currentDate)?.week ?? 1);
  return (
    <Sheet visible={visible} title="Move to…" onClose={onClose}>
      <Text style={type.small}>{workoutTitle}. Your watch will tick it off on the day you choose.</Text>
      <DayPicker schedule={schedule} week={week} onWeek={setWeek} current={currentDate} onSelect={onMove} />
    </Sheet>
  );
}

interface AddProps {
  visible: boolean;
  schedule: Schedule;
  /** The day to start on. */
  initialDate: string;
  onSave: (session: NewSession) => void;
  onClose: () => void;
}

/** Add a gym or strength session of your own on a day, once or every week until the race. */
export function AddSessionSheet({ visible, schedule, initialDate, onSave, onClose }: AddProps) {
  const [title, setTitle] = useState('Gym');
  const [minutes, setMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(initialDate);
  const [week, setWeek] = useState(schedule.get(initialDate)?.week ?? 1);
  const [repeat, setRepeat] = useState(false);

  const mins = Math.round(Number(minutes));
  const problem = !title.trim() ? 'Give the session a name.' : !(mins >= 5 && mins <= 300) ? 'Enter a length between 5 and 300 minutes.' : null;

  const save = () => {
    if (problem) return;
    onSave({ date, title: title.trim(), minutes: mins, notes: notes.trim() || undefined, repeatWeekly: repeat });
    setNotes('');
    setRepeat(false);
  };

  return (
    <Sheet visible={visible} title="Add a session" onClose={onClose}>
      <View style={{ gap: 4 }}>
        <Text style={type.label}>Name</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Gym" placeholderTextColor={colors.inkFaint} />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={type.label}>Length (minutes)</Text>
        <TextInput style={styles.input} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={type.label}>Notes (optional)</Text>
        <TextInput
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
          placeholder="Squats, lunges, core"
          placeholderTextColor={colors.inkFaint}
        />
      </View>
      <Text style={type.label}>Day</Text>
      <DayPicker schedule={schedule} week={week} onWeek={setWeek} selected={date} onSelect={setDate} />
      <View style={styles.repeat}>
        <View style={{ flex: 1 }}>
          <Text style={type.body}>Repeat every week</Text>
          <Text style={type.small}>On the same weekday until the race.</Text>
        </View>
        <Switch value={repeat} onValueChange={setRepeat} trackColor={{ true: colors.accent, false: colors.line }} thumbColor={colors.white} />
      </View>
      {problem && <Text style={styles.error}>{problem}</Text>}
      <Button label={repeat ? 'Add to every week' : 'Add session'} onPress={save} disabled={problem !== null} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  daySelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dayName: { width: 84, fontSize: 13, fontWeight: '600', color: colors.ink },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderLeftWidth: 3, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6, maxWidth: '100%' },
  tagText: { fontSize: 12, color: colors.ink },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.ink,
  },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  error: { color: colors.danger, fontSize: 13 },
});
