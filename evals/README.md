# Coach evals

Checks that the coach (the Coach tab) gives good answers and uses the app correctly.

- **`npm test`** runs the offline part on every push, with no model: the chat loop, the tools, the confirmation
  cards and the harness itself, against scripted replies (`src/__tests__/coach*.test.ts`, `evals.test.ts`).
- **`npm run eval`** puts the real coach through every scenario in `scenarios.ts` against the Claude API:

  ```bash
  ANTHROPIC_API_KEY=sk-ant-… npm run eval -- --model sonnet --judge opus --repeat 1
  ```

  From the phone: GitHub app > Actions > Coach evals > Run workflow (needs an `ANTHROPIC_API_KEY` repository secret).

Each scenario plays a conversation through the app's own chat loop and tools against the athlete in `fixtures.ts`
(Friday 6 November, week 3, a head cold, a short night). Only the model is real; tapping Apply changes that athlete the
same way the store would, so later turns see the change. Two kinds of grading:

- **Checks** (`checks.ts`), pass or fail: the right lookups, the right card with the right fields, nothing claimed done
  before Apply, no made-up numbers, no errors, and at most 120 words so it reads on a phone.
- **A rubric**, graded 1 to 5 by a judge model that sees the lookups and their results. 4 or more passes.

A run passes at 80% of scenarios or better (`--min-pass`). Transcripts are saved to `evals/results/` (not committed)
and kept as an artifact on GitHub. Add a scenario whenever the coach gets something wrong, then change the prompt or
tools until it passes.
