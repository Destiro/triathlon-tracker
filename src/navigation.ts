/** The tabs and what each can be opened with. */
export type TabParams = {
  Today: undefined;
  /** `activity` preselects one of the ready-made activities, e.g. "run"; `at` makes each request distinct. */
  Track: { activity?: string; at?: number } | undefined;
  Log: undefined;
  Plan: undefined;
  Stats: undefined;
};
