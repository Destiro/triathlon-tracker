/**
 * Puts the coach through every scenario against the real Claude API and grades it.
 *
 * Switched off by default because every run is billed: set COACH_EVALS_ENABLED=true to run them.
 *
 *   COACH_EVALS_ENABLED=true ANTHROPIC_API_KEY=sk-ant-… npm run eval -- [--model sonnet] [--judge opus|none] [--only a,b] [--repeat 3] [--min-pass 0.8]
 *
 * Each scenario runs through the app's own chat loop and tools; checks are pass or fail, and scenarios with a rubric
 * are also graded 1 to 5 by a judge model. Results go to evals/results/ and, on GitHub, to the run summary. Exits 1
 * when the pass rate is under --min-pass, so a prompt or model change that makes the coach worse fails the run.
 */
/// <reference types="node" />
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeSender, COACH_MODELS, CoachModel } from '../src/coach/api';
import { ScenarioResult, runScenario } from './harness';
import { SCENARIOS } from './scenarios';

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function model(value: string, flag: string): CoachModel {
  if (Object.keys(COACH_MODELS).includes(value)) return value as CoachModel;
  console.error(`--${flag} must be one of ${Object.keys(COACH_MODELS).join(', ')}.`);
  process.exit(2);
}

async function main() {
  if (process.env.COACH_EVALS_ENABLED !== 'true') {
    console.log('Live coach evals are switched off, so nothing was sent to Claude (each run is billed).');
    console.log('To run them: COACH_EVALS_ENABLED=true ANTHROPIC_API_KEY=sk-ant-… npm run eval');
    console.log('The offline tests of the coach and this harness run free with npm test.');
    process.exit(0);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('Set ANTHROPIC_API_KEY to run the evals.');
    process.exit(2);
  }
  const coachModel = model(option('model', 'sonnet'), 'model');
  const judgeName = option('judge', 'opus');
  const judgeModel = judgeName === 'none' ? null : model(judgeName, 'judge');
  const only = option('only', '').split(',').filter(Boolean);
  const repeat = Math.max(1, Number(option('repeat', '1')) || 1);
  const minPass = Number(option('min-pass', '0.8'));

  const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.name)) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`No scenario called ${only.join(', ')}. There are: ${SCENARIOS.map((s) => s.name).join(', ')}.`);
    process.exit(2);
  }
  const coach = claudeSender(key, coachModel);
  const judgeSend = judgeModel ? claudeSender(key, judgeModel) : undefined;

  console.log(`Coach: ${COACH_MODELS[coachModel].id} · judge: ${judgeModel ? COACH_MODELS[judgeModel].id : 'none'} · ${scenarios.length} scenarios × ${repeat}\n`);
  const results: ScenarioResult[] = [];
  for (let r = 0; r < repeat; r++) {
    // One at a time: the evals are small, and it keeps clear of rate limits.
    for (const scenario of scenarios) {
      const result = await runScenario(scenario, coach, judgeSend);
      results.push(result);
      const failed = result.checks.filter((c) => !c.pass);
      const judged = result.judge ? ` · judge ${result.judge.score}/5` : '';
      console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${scenario.name}${judged}`);
      for (const c of failed) console.log(`      ✗ ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
      if (result.judge && !result.pass) console.log(`      judge: ${result.judge.reason}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const rate = passed / results.length;
  console.log(`\n${passed} of ${results.length} passed (${Math.round(rate * 100)}%). Pass mark ${Math.round(minPass * 100)}%.`);

  const dir = join(process.cwd(), 'evals', 'results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${coachModel}.json`);
  writeFileSync(file, JSON.stringify({ coach: COACH_MODELS[coachModel].id, judge: judgeModel && COACH_MODELS[judgeModel].id, rate, results }, null, 2));
  console.log(`Full transcripts: ${file}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map((r) => `| ${r.pass ? '✅' : '❌'} | ${r.name} | ${r.checks.filter((c) => c.pass).length}/${r.checks.length} | ${r.judge ? `${r.judge.score}/5` : '–'} | ${(r.judge && !r.pass ? r.judge.reason : r.checks.filter((c) => !c.pass).map((c) => c.name).join('; ')).replace(/\|/g, '/')} |`);
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [`## Coach evals: ${passed}/${results.length} passed`, '', `Coach ${COACH_MODELS[coachModel].id}, judge ${judgeModel ? COACH_MODELS[judgeModel].id : 'none'}.`, '', '| | Scenario | Checks | Judge | What failed |', '|---|---|---|---|---|', ...rows, ''].join('\n'),
    );
  }
  process.exit(rate >= minPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
