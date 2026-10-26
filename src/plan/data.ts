/**
 * Triathlete's "20-Week Training Plan for Your First 70.3" (Matt Fitzgerald), as written.
 * https://www.triathlete.com/training/20-week-training-plan-first-70-3-triathlon/
 *
 * Swims are written in yards in the plan. They are kept as the same numbers in metres, which is how they are
 * swum in a 25 m pool (about 9% further).
 */
import { Leg, PlannedWorkout, PlanWeek, WorkoutKind } from './types';

const MOD = 'moderate aerobic intensity';
const LOW = 'low aerobic intensity';

// ---- Swims ----

const swimWarm = (m: number) => `WU: ${m} @ ${LOW}`;
const swimCool = (m: number) => `CD: ${m} @ ${LOW}`;
const DRILLS = '8 × 25 drills, RI 0:10';
const KICK = '8 × 25 kick, RI 0:15';

const swim = (title: string, metres: number, ...steps: string[]): PlannedWorkout => ({ kind: 'swim', title, metres, steps });

/** The long steady Sunday swim: warm-up, one continuous main set, cool-down. */
const steadySwim = (ends: number, main: number) =>
  swim('Swim Base', ends * 2 + main, swimWarm(ends), `MS: ${main} @ ${MOD}`, swimCool(ends));

/** A time trial: the main set is swum as if racing. */
const swimTimeTrial = (ends: number, main: number) =>
  swim(
    'Swim Time Trial',
    ends * 2 + main,
    swimWarm(ends),
    `MS: ${main} @ maximum intensity, as if it were a race`,
    swimCool(ends),
  );

// ---- Rides ----

const bike = (title: string, minutes: number, ...steps: string[]): PlannedWorkout => ({ kind: 'bike', title, minutes, steps });

/** 10 minutes either side of a main set, all at moderate effort unless the main set says otherwise. */
const bikeSet = (title: string, minutes: number, main: string) =>
  bike(title, minutes, `WU: 10 min @ ${MOD}`, `MS: ${main}`, `CD: 10 min @ ${MOD}`);

const foundationBike = (minutes: number, title = 'Foundation Bike') =>
  bikeSet(title, minutes, `${minutes - 20} min @ ${MOD}`);

const powerIntervals = (minutes: number, reps: number) =>
  bikeSet('Bike Power Intervals', minutes, `${reps} × 20 sec sprints in a high gear, easy riding between to fill the time`);

const shortHills = (minutes: number, reps: number) =>
  bikeSet('Bike Short Hill Climbs', minutes, `${reps} × 1 min hill climbs @ speed intensity, easy riding between`);

const longHills = (minutes: number, reps: number) =>
  bikeSet('Bike Long Hill Climbs', minutes, `${reps} × 5 min hill climbs @ VO2max intensity, easy riding between`);

const bikeLactate = (minutes: number, reps: number) =>
  bikeSet(
    'Bike Lactate Intervals',
    minutes,
    `${reps} × 3 min @ VO2max intensity on flat or rolling roads, easy riding between`,
  );

const tempoBike = (warm: number, main: string, cool: number, minutes: number) =>
  bike('Tempo Bike', minutes, `WU: ${warm} min @ ${MOD}`, `MS: ${main}`, `CD: ${cool} min @ ${MOD}`);

const recoveryBike = () =>
  bike('Recovery Bike', 20, 'WU: 10 min @ recovery intensity', 'CD: 10 min @ recovery intensity');

// ---- Runs ----

const run = (title: string, minutes: number, ...steps: string[]): PlannedWorkout => ({ kind: 'run', title, minutes, steps });

const strides = (reps: number) =>
  `Strides: ${reps} × 20 sec @ speed intensity, 40 sec active recovery, straight after the run`;

/** 10 minutes either side of a steady main set. */
const foundationRun = (minutes: number, opts: { title?: string; main?: number; strides?: number } = {}) =>
  run(
    opts.title ?? 'Foundation Run',
    minutes,
    `WU: 10 min @ ${MOD}`,
    `MS: ${opts.main ?? minutes - 20} min @ ${MOD}`,
    `CD: 10 min @ ${MOD}`,
    ...(opts.strides ? [strides(opts.strides)] : []),
  );

const longRun = (minutes: number) => foundationRun(minutes, { title: 'Long Run' });

const fartlekRun = (minutes: number, reps: number) =>
  run(
    'Fartlek Run',
    minutes,
    `WU: 5 min @ ${MOD}`,
    `MS: ${reps} × 30 sec @ VO2max intensity, easy running between to fill the time`,
    `CD: 5 min @ ${MOD}`,
  );

const speedIntervals = (minutes: number, reps: number, cool: number) =>
  run(
    'Run Speed Intervals',
    minutes,
    `WU: 10 min @ ${LOW}`,
    `MS: ${reps} × 30 sec fast, 2 min active recovery between`,
    `CD: ${cool} min @ ${LOW}`,
  );

const lactateRun = (minutes: number, reps: number) =>
  run(
    'Run Lactate Intervals',
    minutes,
    `WU: 10 min @ ${LOW}`,
    `MS: ${reps} × 30 sec @ VO2max intensity, 30 sec @ ${LOW} between`,
    `CD: 10 min @ ${LOW}`,
  );

const tempoRun = (main: number) =>
  run('Tempo Run', main + 20, `WU: 10 min @ ${LOW}`, `MS: ${main} min @ threshold intensity`, `CD: 10 min @ ${LOW}`);

// ---- Bricks and races ----

const brick = (bikeMinutes: number, runMinutes: number): PlannedWorkout => ({
  kind: 'brick',
  title: 'Brick',
  minutes: bikeMinutes + runMinutes,
  legs: [
    { sport: 'bike', minutes: bikeMinutes },
    { sport: 'run', minutes: runMinutes },
  ],
  steps: [`Bike ${bikeMinutes} min @ ${MOD}`, `then straight into: Run ${runMinutes} min @ ${MOD}`],
});

const race = (title: string, legs: Leg[], steps: string[], kind: WorkoutKind = 'race'): PlannedWorkout => ({
  kind,
  title,
  legs,
  steps,
});

const legs = (swimM: number, bikeM: number, runM: number): Leg[] => [
  { sport: 'swim', metres: swimM },
  { sport: 'bike', metres: bikeM },
  { sport: 'run', metres: runM },
];

/** The race itself. Its name comes from Settings; this is the fallback. */
export const RACE_DAY = race('Race day', legs(1900, 90000, 21100), ['Swim 1.9 km', 'Bike 90 km', 'Run 21.1 km']);

const REST: PlannedWorkout[] = [];

export const PLAN: PlanWeek[] = [
  {
    week: 1,
    phase: 'base',
    recovery: false,
    days: [
      REST,
      [powerIntervals(45, 4)],
      [
        swim('Swim Base', 1200, swimWarm(300), DRILLS, `MS: 2 × 100 @ ${MOD}, RI 0:05`, KICK, swimCool(300)),
        fartlekRun(30, 6),
      ],
      [foundationBike(60)],
      [
        swim(
          'Swim Fartlek',
          1200,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 100 (25 easy / 25 hard), easy = ${MOD}, hard = threshold intensity, RI 0:10`,
          swimCool(300),
        ),
        foundationRun(35),
      ],
      [foundationBike(60)],
      [foundationRun(40)],
    ],
  },
  {
    week: 2,
    phase: 'base',
    recovery: false,
    days: [
      REST,
      [powerIntervals(50, 5)],
      [
        swim('Swim Base', 1300, swimWarm(300), DRILLS, `MS: 3 × 100 @ ${MOD}, RI 0:05`, KICK, swimCool(300)),
        fartlekRun(30, 8),
      ],
      [foundationBike(60)],
      [
        swim(
          'Swim Fartlek + Sprint',
          1300,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 100 (25 build / 25 descend), start @ ${MOD}, build to threshold intensity, RI 0:10`,
          '4 × 25 kick, RI 0:15',
          swimCool(300),
        ),
        foundationRun(35),
      ],
      [brick(45, 10)],
      [steadySwim(300, 1000), foundationRun(40)],
    ],
  },
  {
    week: 3,
    phase: 'base',
    recovery: false,
    days: [
      REST,
      [powerIntervals(50, 5)],
      [
        swim('Swim Base', 1400, swimWarm(300), DRILLS, `MS: 4 × 100 @ ${MOD}, RI 0:05`, KICK, swimCool(300)),
        fartlekRun(35, 8),
      ],
      [foundationBike(60)],
      [
        swim(
          'Swim Fartlek + Sprint',
          1400,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 100 (25 easy / 25 hard), easy = ${MOD}, hard = threshold intensity, RI 0:10`,
          KICK,
          swimCool(300),
        ),
        foundationRun(40),
      ],
      [foundationBike(75)],
      [steadySwim(250, 1200), foundationRun(45)],
    ],
  },
  {
    week: 4,
    phase: 'base',
    recovery: true,
    days: [
      REST,
      [powerIntervals(45, 4)],
      [
        swim('Swim Base', 1000, swimWarm(300), DRILLS, `MS: 2 × 100 @ ${MOD}, RI 0:05`, swimCool(300)),
        fartlekRun(30, 6),
      ],
      [foundationBike(30)],
      [
        swim(
          'Swim Fartlek + Sprint',
          1200,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 100 (25 build / 25 descend), start @ ${MOD}, build to threshold intensity, RI 0:10`,
          swimCool(300),
        ),
        foundationRun(35),
      ],
      [foundationBike(45)],
      [steadySwim(200, 1000), brick(45, 10)],
    ],
  },
  {
    week: 5,
    phase: 'base',
    recovery: false,
    days: [
      REST,
      [shortHills(55, 6)],
      [
        swim(
          'Swim Base',
          1450,
          swimWarm(300),
          DRILLS,
          `MS: 3 × 100 @ ${MOD}, RI 0:05`,
          '6 × 25 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        speedIntervals(39, 8, 9),
      ],
      [foundationBike(60)],
      [
        swim(
          'Swim Fartlek + Sprint',
          1600,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 150 (50 easy / 25 hard), easy = ${MOD}, hard = threshold intensity, RI 0:15`,
          KICK,
          swimCool(300),
        ),
        foundationRun(40, { strides: 2 }),
      ],
      [foundationBike(90)],
      [foundationBike(90), foundationRun(50)],
    ],
  },
  {
    week: 6,
    phase: 'base',
    recovery: false,
    days: [
      REST,
      [shortHills(60, 7)],
      [
        swim(
          'Swim Base',
          1575,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 100 @ ${MOD}, RI 0:05`,
          '7 × 25 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        speedIntervals(42, 9, 10),
      ],
      [foundationBike(75)],
      [
        swim(
          'Swim Fartlek + Sprint',
          1700,
          swimWarm(300),
          '6 × 50 drills, RI 0:10',
          `MS: 4 × 150 (50 build / 25 descend), start @ ${MOD}, build to threshold intensity, RI 0:15`,
          KICK,
          swimCool(300),
        ),
        foundationRun(40, { strides: 4 }),
      ],
      [brick(45, 15)],
      [swimTimeTrial(200, 1000), foundationRun(25)],
    ],
  },
  {
    week: 7,
    phase: 'base',
    recovery: false,
    days: [
      REST,
      [shortHills(65, 8)],
      [
        swim(
          'Swim Base',
          1700,
          swimWarm(300),
          DRILLS,
          `MS: 5 × 100 @ ${MOD}, RI 0:05`,
          '8 × 25 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        speedIntervals(42, 10, 10),
      ],
      [foundationBike(75)],
      [
        swim(
          'Swim Fartlek + Sprint',
          1750,
          swimWarm(300),
          DRILLS,
          `MS: 5 × 150 (50 easy / 25 hard), easy = ${MOD}, hard = threshold intensity, RI 0:15`,
          KICK,
          swimCool(300),
        ),
        foundationRun(40, { strides: 6 }),
      ],
      [foundationBike(105)],
      [steadySwim(250, 1500)],
    ],
  },
  {
    week: 8,
    phase: 'base',
    recovery: true,
    days: [
      REST,
      [shortHills(55, 6)],
      [
        swim(
          'Swim Base',
          1250,
          swimWarm(300),
          DRILLS,
          `MS: 3 × 100 @ ${MOD}, RI 0:05`,
          '6 × 25 @ speed intensity, RI 0:20',
          swimCool(300),
        ),
        speedIntervals(39, 8, 9),
      ],
      [foundationBike(45)],
      [
        swim(
          'Swim Fartlek + Sprint',
          1600,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 150 (50 build / 25 descend), start @ ${MOD}, build to threshold intensity, RI 0:15`,
          KICK,
          swimCool(300),
        ),
        foundationRun(35, { strides: 4 }),
      ],
      [foundationBike(60)],
      [steadySwim(300, 1000), brick(45, 15)],
    ],
  },
  {
    week: 9,
    phase: 'build',
    recovery: false,
    days: [
      REST,
      [longHills(60, 2)],
      [
        swim(
          'Swim Base',
          1750,
          swimWarm(300),
          DRILLS,
          `MS: 3 × 100 @ ${MOD}, RI 0:05`,
          '4 × 75 @ VO2max intensity, RI 0:45',
          '6 × 25 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        lactateRun(32, 12),
      ],
      [foundationBike(75)],
      [
        swim(
          'Swim Threshold + Sprint',
          1800,
          swimWarm(300),
          DRILLS,
          'MS: 3 × 200 @ threshold intensity, RI 0:45',
          '4 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(45, { strides: 6 }),
      ],
      [foundationBike(120, 'Long Bike')],
      [steadySwim(300, 1500), foundationRun(60)],
    ],
  },
  {
    week: 10,
    phase: 'build',
    recovery: false,
    days: [
      REST,
      [bikeLactate(60, 2)],
      [
        swim(
          'Swim Base',
          1825,
          swimWarm(300),
          DRILLS,
          `MS: 3 × 100 @ ${MOD}, RI 0:05`,
          '5 × 75 @ VO2max intensity, RI 0:45',
          '6 × 25 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        lactateRun(34, 14),
      ],
      [foundationBike(90)],
      [
        swim(
          'Swim Threshold + Sprint',
          1900,
          swimWarm(300),
          DRILLS,
          'MS: 3 × 200 @ threshold intensity, RI 0:45',
          '6 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(45, { strides: 6 }),
      ],
      [brick(60, 20)],
      [steadySwim(250, 1800), foundationRun(30)],
    ],
  },
  {
    week: 11,
    phase: 'build',
    recovery: false,
    days: [
      REST,
      [longHills(65, 3)],
      [
        swim(
          'Swim Base',
          1900,
          swimWarm(300),
          DRILLS,
          `MS: 3 × 100 @ ${MOD}, RI 0:05`,
          '6 × 75 @ VO2max intensity, RI 0:45',
          '6 × 25 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        lactateRun(36, 16),
      ],
      [foundationBike(90)],
      [
        swim(
          'Swim Threshold + Sprint',
          2000,
          swimWarm(300),
          DRILLS,
          'MS: 4 × 200 @ threshold intensity, RI 0:45',
          '4 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(45, { strides: 6 }),
      ],
      [foundationBike(135, 'Long Bike')],
      [swimTimeTrial(250, 1650), longRun(65)],
    ],
  },
  {
    week: 12,
    phase: 'build',
    recovery: true,
    days: [
      REST,
      [bikeLactate(60, 2)],
      [
        swim(
          'Swim Base',
          1400,
          swimWarm(300),
          DRILLS,
          `MS: 3 × 100 @ ${MOD}, RI 0:05`,
          '4 × 75 @ VO2max intensity, RI 0:45',
          swimCool(300),
        ),
        lactateRun(32, 12),
      ],
      [foundationBike(75)],
      [
        swim(
          'Swim Threshold + Sprint',
          1600,
          swimWarm(300),
          DRILLS,
          'MS: 3 × 200 @ threshold intensity, RI 0:45',
          KICK,
          swimCool(300),
        ),
        foundationRun(35, { strides: 6 }),
      ],
      [recoveryBike()],
      [
        race('Sprint Triathlon', legs(800, 19300, 4800), [
          "Optional tune-up race. If you can't find one, do it as a time trial on your own:",
          'Swim 800 m',
          'Bike 19 km (12 miles)',
          'Run 5 km (3 miles)',
        ]),
      ],
    ],
  },
  {
    week: 13,
    phase: 'build',
    recovery: false,
    days: [
      REST,
      [longHills(70, 4)],
      [
        swim(
          'Swim Base',
          1900,
          swimWarm(300),
          DRILLS,
          `MS: 5 × 100 @ ${MOD}, RI 0:05`,
          '4 × 100 @ VO2max intensity, RI 1:00',
          KICK,
          swimCool(300),
        ),
        lactateRun(38, 18),
      ],
      [foundationBike(90)],
      [
        swim(
          'Swim Threshold + Sprint',
          2100,
          swimWarm(300),
          DRILLS,
          'MS: 3 × 300 @ threshold intensity, RI 1:00',
          '4 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(45, { strides: 6 }),
      ],
      [foundationBike(150, 'Long Bike')],
      [steadySwim(250, 1800), longRun(70)],
    ],
  },
  {
    week: 14,
    phase: 'build',
    recovery: false,
    days: [
      REST,
      [bikeLactate(75, 4)],
      [
        swim(
          'Swim Base',
          2000,
          swimWarm(300),
          DRILLS,
          `MS: 6 × 100 @ ${MOD}, RI 0:05`,
          '4 × 100 @ VO2max intensity, RI 1:00',
          KICK,
          swimCool(300),
        ),
        lactateRun(40, 20),
      ],
      [foundationBike(90)],
      [
        swim(
          'Swim Threshold + Sprint',
          2100,
          swimWarm(300),
          DRILLS,
          'MS: 3 × 300 @ threshold intensity, RI 0:45',
          '4 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(50, { strides: 6 }),
      ],
      [foundationBike(105)],
      [steadySwim(300, 1800), brick(75, 30)],
    ],
  },
  {
    week: 15,
    phase: 'peak',
    recovery: false,
    days: [
      REST,
      [tempoBike(13, '2 × 12 min @ threshold intensity, 10 min active recovery between', 13, 60)],
      [
        swim(
          'Swim Base',
          2100,
          swimWarm(300),
          DRILLS,
          `MS: 6 × 100 @ ${MOD}, RI 0:05`,
          '5 × 100 @ VO2max intensity, RI 1:00',
          KICK,
          swimCool(300),
        ),
        tempoRun(16),
      ],
      [foundationBike(90)],
      [
        swim(
          'Swim Threshold + Sprint',
          2100,
          swimWarm(300),
          DRILLS,
          'MS: 3 × 300 @ threshold intensity, RI 0:30',
          '4 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(50, { strides: 6 }),
      ],
      [foundationBike(165, 'Long Bike')],
      [steadySwim(250, 2000), longRun(80)],
    ],
  },
  {
    week: 16,
    phase: 'peak',
    recovery: true,
    days: [
      REST,
      [tempoBike(17, '22 min @ threshold intensity', 16, 55)],
      [
        swim(
          'Swim Base',
          1600,
          swimWarm(300),
          DRILLS,
          `MS: 4 × 100 @ ${MOD}, RI 0:05`,
          '4 × 100 @ VO2max intensity, RI 1:00',
          swimCool(300),
        ),
        tempoRun(14),
      ],
      [foundationBike(60)],
      [
        swim(
          'Swim Threshold + Sprint',
          1400,
          swimWarm(300),
          DRILLS,
          'MS: 3 × 200 @ threshold intensity, RI 0:45',
          swimCool(300),
        ),
        // The plan calls this 50 minutes but lists 10 + 20 + 10.
        foundationRun(50, { main: 20, strides: 4 }),
      ],
      [recoveryBike()],
      [
        race('Olympic-Distance Triathlon', legs(1500, 40000, 10000), [
          "Optional tune-up race. If you can't find one, do it as a time trial on your own:",
          'Swim 1.5 km',
          'Bike 40 km',
          'Run 10 km',
        ]),
      ],
    ],
  },
  {
    week: 17,
    phase: 'peak',
    recovery: false,
    days: [
      REST,
      [tempoBike(21, '24 min @ threshold intensity', 20, 65)],
      [
        swim(
          'Swim Base',
          2100,
          swimWarm(300),
          DRILLS,
          `MS: 5 × 100 @ ${MOD}, RI 0:05`,
          '6 × 100 @ VO2max intensity, RI 1:00',
          KICK,
          swimCool(300),
        ),
        tempoRun(16),
      ],
      [foundationBike(90)],
      [
        swim(
          'Swim Threshold + Sprint',
          2100,
          swimWarm(300),
          DRILLS,
          'MS: 2 × 400 @ threshold intensity, RI 1:15',
          '6 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(55, { strides: 4 }),
      ],
      [foundationBike(180, 'Long Bike')],
      [steadySwim(250, 2000), longRun(90)],
    ],
  },
  {
    week: 18,
    phase: 'peak',
    recovery: false,
    days: [
      REST,
      [tempoBike(22, '26 min @ threshold intensity', 22, 70)],
      [
        swim(
          'Swim Base',
          2100,
          swimWarm(300),
          DRILLS,
          `MS: 5 × 100 @ ${MOD}, RI 0:05`,
          '6 × 100 @ VO2max intensity, RI 0:45',
          KICK,
          swimCool(300),
        ),
        tempoRun(18),
      ],
      [foundationBike(105)],
      [
        swim(
          'Swim Threshold + Sprint',
          2100,
          swimWarm(300),
          DRILLS,
          'MS: 2 × 400 @ threshold intensity, RI 1:00',
          '6 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(60, { strides: 4 }),
      ],
      [brick(105, 45)],
      [swimTimeTrial(200, 2112), foundationRun(30)],
    ],
  },
  {
    week: 19,
    phase: 'taper',
    recovery: false,
    days: [
      REST,
      [tempoBike(19, `2 × 14 min @ threshold intensity, 10 min @ ${MOD} between`, 18, 75)],
      [
        swim(
          'Swim Base',
          2100,
          swimWarm(300),
          DRILLS,
          `MS: 5 × 100 @ ${MOD}, RI 0:05`,
          '6 × 100 @ VO2max intensity, RI 0:30',
          KICK,
          swimCool(300),
        ),
        tempoRun(20),
      ],
      [foundationBike(90)],
      [
        swim(
          'Swim Threshold + Sprint',
          2100,
          swimWarm(300),
          DRILLS,
          'MS: 2 × 400 @ threshold intensity, RI 0:45',
          '6 × 50 @ speed intensity, RI 0:20',
          KICK,
          swimCool(300),
        ),
        foundationRun(55, { strides: 4 }),
      ],
      [foundationBike(135, 'Long Bike')],
      [steadySwim(250, 1500), longRun(65)],
    ],
  },
  {
    week: 20,
    phase: 'race',
    recovery: false,
    days: [
      REST,
      [tempoBike(13, '2 × 12 min @ threshold intensity, 10 min active recovery between', 13, 60)],
      [
        swim(
          'Swim Base',
          1700,
          swimWarm(300),
          DRILLS,
          `MS: 3 × 100 @ ${MOD}, RI 0:05`,
          '6 × 100 @ VO2max intensity, RI 1:00',
          swimCool(300),
        ),
        tempoRun(12),
      ],
      [foundationBike(45)],
      [
        swim(
          'Swim Threshold + Sprint',
          1100,
          swimWarm(300),
          'MS: 2 × 200 @ threshold intensity, RI 0:45',
          '4 × 25 @ speed intensity, RI 0:20',
          swimCool(300),
        ),
      ],
      [
        swim(
          'Swim Threshold + Sprint',
          1100,
          swimWarm(300),
          'MS: 2 × 200 @ threshold intensity, RI 0:45',
          '4 × 25 @ speed intensity, RI 0:20',
          swimCool(300),
        ),
      ],
      [RACE_DAY],
    ],
  },
];
