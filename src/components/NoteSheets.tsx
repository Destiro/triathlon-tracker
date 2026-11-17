import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Activity } from '../activities';
import { fromKey, isDateKey } from '../dates';
import { activeIssues, FEEL_LABELS, HealthIssue, issueDays, NewIssue, RPE_LABELS, SEVERITY_LABELS, SessionNote, sessionLoad, summariseNote } from '../notes';
import { useStore, useTodayKey } from '../store';
import { colors, radius, spacing, type } from '../theme';
import { Sheet } from './PlanSheets';
import { Button, Card, Chips } from './ui';

const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const amount = (text: string): number | undefined => {
  const n = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

const RPE_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const FEEL_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: FEEL_LABELS[n] }));

/** How a workout went: effort, how you felt, what you ate and drank, and a few words. */
export function NoteSheet({ title, note, onSave, onClose }: { title: string; note: SessionNote | undefined; onSave: (note: SessionNote) => void; onClose: () => void }) {
  const [rpe, setRpe] = useState(note?.rpe !== undefined ? String(note.rpe) : '');
  const [feel, setFeel] = useState(note?.feel !== undefined ? String(note.feel) : '');
  const [carbs, setCarbs] = useState(note?.nutrition?.carbsG?.toString() ?? '');
  const [fluid, setFluid] = useState(note?.nutrition?.fluidMl?.toString() ?? '');
  const [sodium, setSodium] = useState(note?.nutrition?.sodiumMg?.toString() ?? '');
  const [caffeine, setCaffeine] = useState(note?.nutrition?.caffeineMg?.toString() ?? '');
  const [what, setWhat] = useState(note?.nutrition?.what ?? '');
  const [text, setText] = useState(note?.text ?? '');

  // Tapping the one that is chosen clears it.
  const pick = (current: string, set: (v: string) => void) => (v: string) => set(v === current ? '' : v);

  const save = () =>
    onSave({
      rpe: rpe ? Number(rpe) : undefined,
      feel: feel ? Number(feel) : undefined,
      text,
      nutrition: { carbsG: amount(carbs), fluidMl: amount(fluid), sodiumMg: amount(sodium), caffeineMg: amount(caffeine), what },
    });

  return (
    <Sheet visible title="How it went" onClose={onClose}>
      <Text style={type.small}>{title}</Text>
      <View style={{ gap: spacing.xs }}>
        <Text style={type.label}>Effort: how hard it felt</Text>
        <Chips options={RPE_OPTIONS} value={rpe} onChange={pick(rpe, setRpe)} />
        <Text style={type.small}>{rpe ? `${rpe}/10 · ${RPE_LABELS[Number(rpe)]}` : '1 is very easy, 10 is all you have.'}</Text>
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text style={type.label}>How you felt</Text>
        <Chips options={FEEL_OPTIONS} value={feel} onChange={pick(feel, setFeel)} />
      </View>
      <Text style={type.label}>Fuelling</Text>
      <View style={styles.row}>
        <Field label="Carbs (g)" value={carbs} onChange={setCarbs} numeric />
        <Field label="Fluid (ml)" value={fluid} onChange={setFluid} numeric />
      </View>
      <View style={styles.row}>
        <Field label="Sodium (mg)" value={sodium} onChange={setSodium} numeric />
        <Field label="Caffeine (mg)" value={caffeine} onChange={setCaffeine} numeric />
      </View>
      <Field label="What you had" value={what} onChange={setWhat} placeholder="2 gels and a banana" />
      <Field label="Notes" value={text} onChange={setText} placeholder="Legs heavy early, came good after the turn" multiline />
      <Button label="Save" onPress={save} />
    </Sheet>
  );
}

/** What was noted about a recorded workout, with a button to add or change it. */
export function NoteRow({ activity }: { activity: Activity }) {
  const { notes, saveNote } = useStore();
  const [open, setOpen] = useState(false);
  const note = notes[String(activity.id)];
  const summary = note ? summariseNote(note) : '';
  return (
    <View style={{ gap: 4 }}>
      {note && (
        <View accessibilityLabel="Your note">
          {summary !== '' && <Text style={styles.noteLine}>{summary}</Text>}
          {note.rpe !== undefined && activity.movingS > 0 && <Text style={type.small}>Session load {sessionLoad(note.rpe, activity.movingS)} (effort x minutes)</Text>}
          {note.text && <Text style={type.body}>{note.text}</Text>}
        </View>
      )}
      <Pressable onPress={() => setOpen(true)} style={styles.noteButton} accessibilityRole="button">
        <Text style={styles.noteButtonText}>{note ? 'Edit how it went' : 'Add how it went'}</Text>
      </Pressable>
      {open && (
        <NoteSheet
          title={activity.name}
          note={note}
          onClose={() => setOpen(false)}
          onSave={(n) => {
            saveNote(activity.id, n);
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}

const KIND_OPTIONS = [
  { value: 'injury', label: 'Injury' },
  { value: 'illness', label: 'Illness' },
];
const SEVERITY_OPTIONS = [
  { value: '1', label: 'Mild' },
  { value: '2', label: 'Moderate' },
  { value: '3', label: 'Severe' },
];

/** Logs an injury or an illness, from today or an earlier day. */
export function IssueSheet({ today, onSave, onClose }: { today: string; onSave: (issue: NewIssue) => void; onClose: () => void }) {
  const [kind, setKind] = useState<'injury' | 'illness'>('injury');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('');
  const [start, setStart] = useState(today);
  const [notes, setNotes] = useState('');
  const problem = !title.trim() ? 'Say what it is, such as Left knee.' : !isDateKey(start) ? 'Use the format YYYY-MM-DD for the start day.' : start > today ? 'It cannot start in the future.' : null;
  return (
    <Sheet visible title="Log an injury or illness" onClose={onClose}>
      <Chips options={KIND_OPTIONS} value={kind} onChange={(v) => setKind(v as 'injury' | 'illness')} />
      <Field label="What is it" value={title} onChange={setTitle} placeholder={kind === 'injury' ? 'Left knee' : 'Head cold'} />
      <View style={{ gap: spacing.xs }}>
        <Text style={type.label}>How bad</Text>
        <Chips options={SEVERITY_OPTIONS} value={severity} onChange={(v) => setSeverity(v === severity ? '' : v)} />
      </View>
      <Field label="Started (YYYY-MM-DD)" value={start} onChange={setStart} />
      <Field label="Notes" value={notes} onChange={setNotes} placeholder="Sore on stairs, fine on the flat" multiline />
      {problem && <Text style={styles.error}>{problem}</Text>}
      <Button label="Save" disabled={problem !== null} onPress={() => onSave({ kind, title, start, severity: severity ? (Number(severity) as 1 | 2 | 3) : undefined, notes })} />
    </Sheet>
  );
}

function IssueRow({ issue, today }: { issue: HealthIssue; today: string }) {
  const { clearIssue, deleteIssue } = useStore();
  const ongoing = !issue.end;
  const days = issueDays(issue, today);
  const confirmDelete = () =>
    Alert.alert('Delete this entry?', issue.title, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteIssue(issue.id) },
    ]);
  return (
    <View style={styles.issue}>
      <Text style={type.heading}>{issue.title}</Text>
      <Text style={type.small}>
        {issue.kind === 'injury' ? 'Injury' : 'Illness'}
        {issue.severity ? ` · ${SEVERITY_LABELS[issue.severity]}` : ''} · {shortDate(issue.start)}
        {issue.end ? ` to ${shortDate(issue.end)}` : ' · ongoing'} · {days} {days === 1 ? 'day' : 'days'}
      </Text>
      {issue.notes && <Text style={type.body}>{issue.notes}</Text>}
      <View style={styles.row}>
        <Pressable onPress={() => clearIssue(issue.id, ongoing ? today : undefined)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.noteButtonText}>{ongoing ? 'Mark cleared today' : 'Reopen'}</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.noteButtonText, { color: colors.danger }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Injuries and illnesses: what is on now, what has cleared, and a way to log a new one. */
export function IssuesCard() {
  const { issues, logIssue } = useStore();
  const today = useTodayKey();
  const [adding, setAdding] = useState(false);
  const on = activeIssues(issues, today);
  const past = issues.filter((i) => !on.includes(i));
  return (
    <Card title="Injury and illness" note="Log what you are carrying so it is on record when you look back at a bad week.">
      {issues.length === 0 && <Text style={type.body}>Nothing logged. That is the way to keep it.</Text>}
      {on.map((i) => (
        <IssueRow key={i.id} issue={i} today={today} />
      ))}
      {past.length > 0 && <Text style={type.label}>Cleared</Text>}
      {past.map((i) => (
        <IssueRow key={i.id} issue={i} today={today} />
      ))}
      <Button label="Log an injury or illness" onPress={() => setAdding(true)} />
      {adding && (
        <IssueSheet
          today={today}
          onClose={() => setAdding(false)}
          onSave={(issue) => {
            logIssue(issue);
            setAdding(false);
          }}
        />
      )}
    </Card>
  );
}

/** A reminder at the top of Today while something is on. */
export function IssueBanner() {
  const { issues } = useStore();
  const today = useTodayKey();
  const on = activeIssues(issues, today);
  if (on.length === 0) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      {on.map((i) => (
        <Text key={i.id} style={styles.bannerText}>
          {i.kind === 'injury' ? 'Injured' : 'Ill'}: {i.title}, day {issueDays(i, today)}. Go easy, and move a session if you need to.
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
  row: { flexDirection: 'row', gap: spacing.md },
  noteLine: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  noteButton: { alignSelf: 'flex-start', paddingVertical: 4 },
  noteButtonText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  issue: { gap: 4, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  banner: { backgroundColor: colors.warningSoft, borderWidth: 1.5, borderColor: colors.warning, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  bannerText: { color: colors.warning, fontWeight: '600', fontSize: 14 },
  error: { color: colors.danger, fontSize: 13 },
});
