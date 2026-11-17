import { fromKey } from './dates';

// Notes you add to a workout, and injuries and illnesses you log. Kept apart from what the watch records, so a read
// from Health Connect never touches them.

export interface Nutrition {
  carbsG?: number;
  fluidMl?: number;
  sodiumMg?: number;
  caffeineMg?: number;
  /** What it was, such as "2 gels and a banana". */
  what?: string;
}

export interface SessionNote {
  /** How hard it felt, from 1 (very easy) to 10 (maximal). */
  rpe?: number;
  /** How you felt, from 1 (awful) to 5 (great). */
  feel?: number;
  text?: string;
  nutrition?: Nutrition;
}

/** Notes by workout id (as a string, so they save as JSON). */
export type Notes = Record<string, SessionNote>;

export const RPE_LABELS: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Easy',
  4: 'Moderate',
  5: 'Moderate',
  6: 'Hard',
  7: 'Hard',
  8: 'Very hard',
  9: 'Very hard',
  10: 'Maximal',
};
export const FEEL_LABELS: Record<number, string> = { 1: 'Awful', 2: 'Poor', 3: 'OK', 4: 'Good', 5: 'Great' };

const NUTRITION_KEYS: (keyof Nutrition)[] = ['carbsG', 'fluidMl', 'sodiumMg', 'caffeineMg', 'what'];

const clean = (n: Nutrition | undefined): Nutrition | undefined => {
  if (!n) return undefined;
  const out: Nutrition = {};
  for (const key of NUTRITION_KEYS) {
    const v = n[key];
    if (key === 'what') {
      const text = typeof v === 'string' ? v.trim() : '';
      if (text) out.what = text;
    } else if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[key] = Math.round(v);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/** A note with only what is usable in it: ratings in range, blank text and zero amounts dropped. Null when nothing is left. */
export function cleanNote(note: SessionNote): SessionNote | null {
  const out: SessionNote = {};
  if (typeof note.rpe === 'number' && note.rpe >= 1 && note.rpe <= 10) out.rpe = Math.round(note.rpe);
  if (typeof note.feel === 'number' && note.feel >= 1 && note.feel <= 5) out.feel = Math.round(note.feel);
  const text = typeof note.text === 'string' ? note.text.trim() : '';
  if (text) out.text = text;
  const nutrition = clean(note.nutrition);
  if (nutrition) out.nutrition = nutrition;
  return Object.keys(out).length > 0 ? out : null;
}

/** Saves a workout's note, or removes it when it has nothing in it. Returns a new object. */
export function setNote(notes: Notes, workoutId: number, note: SessionNote): Notes {
  const next = { ...notes };
  const cleaned = cleanNote(note);
  if (cleaned) next[String(workoutId)] = cleaned;
  else delete next[String(workoutId)];
  return next;
}

/** Session RPE load: how hard times how long, in the same arbitrary units people use for it (RPE x minutes). */
export const sessionLoad = (rpe: number, movingS: number): number => Math.round(rpe * (movingS / 60));

/** "Effort 7 · Hard · felt good · 60 g carbs · 500 ml" in one line. */
export function summariseNote(note: SessionNote): string {
  const parts: string[] = [];
  if (note.rpe !== undefined) parts.push(`Effort ${note.rpe}/10 · ${RPE_LABELS[note.rpe]}`);
  if (note.feel !== undefined) parts.push(`Felt ${FEEL_LABELS[note.feel].toLowerCase()}`);
  const n = note.nutrition;
  if (n?.carbsG) parts.push(`${n.carbsG} g carbs`);
  if (n?.fluidMl) parts.push(`${n.fluidMl} ml fluid`);
  if (n?.sodiumMg) parts.push(`${n.sodiumMg} mg sodium`);
  if (n?.caffeineMg) parts.push(`${n.caffeineMg} mg caffeine`);
  if (n?.what) parts.push(n.what);
  return parts.join(' · ');
}

/** Merges notes from a backup under the ones on the phone: where both have a note for a workout, the phone's wins. */
export const mergeNotes = (phone: Notes, backup: Notes): Notes => ({ ...backup, ...phone });

// ---- Injury and illness ----

export type IssueKind = 'injury' | 'illness';

export interface HealthIssue {
  id: string;
  kind: IssueKind;
  /** What it is: "Left knee", "Head cold". */
  title: string;
  /** The day it started, YYYY-MM-DD. */
  start: string;
  /** The day it cleared, if it has. */
  end?: string;
  /** 1 mild, 2 moderate, 3 severe. */
  severity?: 1 | 2 | 3;
  notes?: string;
}

export const SEVERITY_LABELS = { 1: 'Mild', 2: 'Moderate', 3: 'Severe' } as const;

export interface NewIssue {
  kind: IssueKind;
  title: string;
  start: string;
  severity?: 1 | 2 | 3;
  notes?: string;
}

/** Adds an issue, newest first. A blank title is ignored. */
export function addIssue(issues: HealthIssue[], input: NewIssue, id: string): HealthIssue[] {
  const title = input.title.trim();
  if (!title) return issues;
  const issue: HealthIssue = { id, kind: input.kind, title, start: input.start };
  if (input.severity) issue.severity = input.severity;
  const notes = input.notes?.trim();
  if (notes) issue.notes = notes;
  return [issue, ...issues].sort((a, b) => b.start.localeCompare(a.start));
}

/** Marks an issue as cleared on a day, or open again when `end` is undefined. */
export const resolveIssue = (issues: HealthIssue[], id: string, end: string | undefined): HealthIssue[] =>
  issues.map((i) => {
    if (i.id !== id) return i;
    const { end: _old, ...rest } = i;
    return end && end >= i.start ? { ...rest, end } : rest;
  });

export const removeIssue = (issues: HealthIssue[], id: string): HealthIssue[] => issues.filter((i) => i.id !== id);

/** Issues that are on at the end of `day`: started by then and not cleared before it. */
export const activeIssues = (issues: HealthIssue[], day: string): HealthIssue[] => issues.filter((i) => i.start <= day && (!i.end || i.end >= day));

/** Days an issue has run: a one day issue is 1. Ongoing ones count up to `today`. */
export const issueDays = (issue: HealthIssue, today: string): number => {
  const last = issue.end ?? today;
  return Math.max(1, Math.round((fromKey(last).getTime() - fromKey(issue.start).getTime()) / 86400000) + 1);
};

/** Merges issues from a backup under the phone's: the phone's copy of an issue wins. */
export function mergeIssues(phone: HealthIssue[], backup: HealthIssue[]): HealthIssue[] {
  const have = new Set(phone.map((i) => i.id));
  return [...phone, ...backup.filter((i) => !have.has(i.id))].sort((a, b) => b.start.localeCompare(a.start));
}

/** Keeps what is usable from a saved list of issues. */
export function readIssues(raw: unknown): HealthIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is HealthIssue =>
      typeof i === 'object' &&
      i !== null &&
      typeof i.id === 'string' &&
      (i.kind === 'injury' || i.kind === 'illness') &&
      typeof i.title === 'string' &&
      typeof i.start === 'string',
  );
}

/** Keeps what is usable from a saved set of notes. */
export function readNotes(raw: unknown): Notes {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Notes = {};
  for (const [id, note] of Object.entries(raw)) {
    const cleaned = typeof note === 'object' && note !== null ? cleanNote(note as SessionNote) : null;
    if (cleaned) out[id] = cleaned;
  }
  return out;
}

