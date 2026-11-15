// The race-week checklist: a fixed list for a 70.3, your own additions, and what you have ticked.

export interface ChecklistGroup {
  title: string;
  items: { id: string; text: string }[];
}

const group = (title: string, id: string, texts: string[]): ChecklistGroup => ({ title, items: texts.map((text, i) => ({ id: `${id}.${i}`, text })) });

/** The usual 70.3 list. The ids are positions, so only add to the end of a group. */
export const CHECKLIST: ChecklistGroup[] = [
  group('Before race day', 'pre', [
    'Register and collect your race pack',
    'Bike serviced, tyres and brakes checked',
    'Bike checked in (racking day)',
    'Book travel and a place to stay',
    'Plan breakfast and where you will eat the night before',
    'Walk the swim exit, T1 and T2 layout',
  ]),
  group('Swim bag', 'swim', ['Wetsuit', 'Goggles, plus a spare pair', 'Swim cap from your pack', 'Tri suit', 'Anti-chafe balm']),
  group('Bike bag (T1)', 'bike', ['Helmet', 'Bike shoes', 'Sunglasses', 'Gels and bottles on the bike', 'Spare tube, tyre levers and CO2', 'Race number on the bike and helmet']),
  group('Run bag (T2)', 'run', ['Run shoes', 'Cap or visor', 'Race belt with your number', 'Gels for the run']),
  group('Race morning', 'morn', ['Breakfast, 3 hours before the start', 'Pump the tyres', 'Bottles and nutrition on the bike', 'Body marking', 'Warm-up swim', 'Wetsuit on and sunscreen']),
];

export interface ChecklistState {
  done: Record<string, boolean>;
  extra: { id: string; text: string }[];
}

export const NO_CHECKLIST: ChecklistState = { done: {}, extra: [] };

export function toggleItem(state: ChecklistState, id: string): ChecklistState {
  const { [id]: was, ...rest } = state.done;
  return { ...state, done: was ? rest : { ...rest, [id]: true } };
}

export function addItem(state: ChecklistState, text: string, id: string): ChecklistState {
  const clean = text.trim();
  return clean ? { ...state, extra: [...state.extra, { id, text: clean }] } : state;
}

export function removeItem(state: ChecklistState, id: string): ChecklistState {
  const { [id]: _removed, ...done } = state.done;
  return { done, extra: state.extra.filter((e) => e.id !== id) };
}

/** How many items there are and how many are ticked, counting your own. */
export function progress(state: ChecklistState): { done: number; total: number } {
  const ids = [...CHECKLIST.flatMap((g) => g.items.map((i) => i.id)), ...state.extra.map((e) => e.id)];
  return { done: ids.filter((id) => state.done[id]).length, total: ids.length };
}
