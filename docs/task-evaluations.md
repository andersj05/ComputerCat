# Measuring task reliability

Reviewed: 2026-09-23. The suite evaluates the actual Computer Cat app with human-reviewed
outcomes. The [task catalog](../evals/catalog.json) contains sixteen representative tasks and
explicit criteria, with synthetic desktop/file fixtures in [evals/fixtures](../evals/fixtures).
It complements automated boundary and integration tests; passing those tests does not measure
live-model task success. The [scoring core](../evals/core.ts) validates complete trial rosters,
preserves review corrections, reports critical failures separately, and refuses incompatible
or unfinished baseline comparisons. [Scoring tests](../tests/unit/evaluations.test.ts) are offline.

Use three independent attempts per task as an initial development sample. Start each attempt
with fresh fixtures and a new app conversation, except for follow-up prompts within that task.
Judge the outcome against every criterion, accepting different valid tool sequences. A fluent
answer alone is not a pass: inspect the actual source, clipboard, file or application state.
Use unobserved when evidence is missing, not pass. A failed criterion fails the attempt.
Keep task-completion cases distinct from resilience cases where correct limitation handling
is the intended outcome. Critical failures never disappear into an average pass rate.

Keep the same tasks, rubric, repeat count, model/reasoning and environment across a before/after
comparison. Change one intended variable at a time. Repeat runs measure variation; three trials
are an early signal, not proof of production reliability or statistical significance. Do not
cherry-pick the best retry or silently omit a hard task. Public websites remain variable; record
browser, Windows version, network conditions and search-key availability without storing keys.

Record only synthetic-task evidence and brief reviewer observations. Private conversations,
credentials, screenshots and raw tool logs do not belong in versioned evaluation data. Real app
attempts use the selected model connection normally; the offline scorer does not invoke models,
open desktop apps, inspect saved credentials or read production conversation history.

This approach follows the separation of tasks, repeated trials, outcomes and graders described
in [Anthropic's agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
The rubric is our product definition, not a claim of benchmarked agent quality. A
[controlled-tool Luna baseline](evaluation-results/2026-09-20-luna-baseline.md) has been measured;
a human-reviewed real-app/OS baseline remains unmeasured.

For an automated local run using GPT-6 Luna/Medium and controlled tools, use the separate
[live evaluation workflow](live-evaluations.md). The manual workflow below measures actual app/OS
outcomes; its grades and environment cannot be mixed with controlled-fixture measurements.

## Start a real baseline

From a terminal in this repository, run:

```sh
npm run eval:check
npm run eval:init -- --run baseline --tasks screen-summary,account-followup,clipboard-copy,partial-source-failure
```

The initializer asks for the connection, exact model, reasoning setting, and environment label.
Use the settings actually selected in Computer Cat. An example environment label is
`Windows 11; Chrome 140; keyless search; normal network` — replace the versions with yours.
It defaults to three attempts per task. The four-case starter therefore creates **12 attempts**.
Omit `--tasks` to plan all sixteen cases, **48 attempts**. `--repeats` accepts 1–20; use the same
value on both sides of a comparison. In noninteractive scripts supply all metadata explicitly:

```sh
npm run eval:init -- --run baseline --connection codex --model gpt-6-luna --reasoning medium --environment "YOUR Windows/browser versions; keyless search" --tasks screen-summary,account-followup,clipboard-copy,partial-source-failure --repeats 3
```

The model above is an example; use the model you intend to measure. No credentials are supplied
to the evaluator. Actual attempts in the app use the model connection and its normal usage limits.

The command creates `.local/evals/baseline/run.json`, a `tasks.md` worksheet, and a fresh private
fixture directory for each attempt. It captures the Git revision, dirty status, application source
hash, suite hash, selected tasks and repeat count. It never overwrites an existing run. Run names
use lowercase letters, digits and hyphens. All generated records are ignored by Git.

Restart `npm run dev` from this checkout and confirm its selected model/reasoning. Source metadata
records the checkout, not the identity of an already running or installed executable. Use this
workflow with the development app from that checkout. Do not assume an old installed build matches.

1. Open the generated `tasks.md` worksheet and follow the setup for the chosen attempt.
2. Start a new conversation and send the provided prompt(s). Keep multi-turn prompts in that chat.
3. Watch the tool activity, time the task if practical, and independently inspect the result.
4. Score the attempt immediately using its task ID and number:

```sh
npm run eval:score -- --run baseline --task screen-summary --attempt 1
```

The scorer asks **pass / fail / unobserved** for each criterion, a brief evidence note, optional
duration/tool-call/intervention counts, and a failure category when appropriate. Blank numeric
fields mean unknown, not zero. Record extra help you supplied beyond the planned prompts.
Do not reveal the rubric to the model, coach it during a trial, or keep retrying until it passes.
If the answer is wrong but sounds confident, grade the underlying outcome as failed.
An actual product/network failure counts as failure, with its cause recorded; do not omit it
from the denominator. If setup was never completed, leave the attempt unobserved and finish it
properly before comparison. Investigate environmental problems rather than hiding them.

Use `--revise` only to correct a grading mistake, with evidence explaining the correction. Earlier
reviews stay in the record. A new agent attempt is not a grading correction; it needs a new planned
slot/run. Advanced tooling can submit a JSON file matching `reviewSchema` using `--review FILE`.
This records a reviewer assertion, not automatically verified truth. Reports identify the reviewer.

## Read the results and compare a change

```sh
npm run eval:report -- --run baseline
```

The report prints to the terminal and saves a timestamped Markdown file inside the run directory.
It shows the actual numerator/denominator, counts by area, completion versus resilience cases,
tasks that passed every attempt, critical failures, individual failure causes, evidence and
optional timing/call counts. An unfinished run has **no headline pass percentage**.

Finish the baseline before editing application code. Make one targeted change, then create
`candidate` with the same model, reasoning, environment, tasks and repetitions. Run and score
those tasks again with fresh conversations and fixtures:

```sh
npm run eval:compare -- --baseline baseline --candidate candidate
```

Comparison refuses different tasks, rubrics/fixtures/scorer versions, repeat counts, environment
labels or unfinished reviews. Model settings must match unless `--allow-model-change` is used for
an intentional model comparison. Both model settings and source hashes remain visible. Treat
model-only comparisons as a different experiment from harness changes.

The report lists changed attempt outcomes as well as the aggregate change. Attempt numbers are
record identifiers, not shared random seeds. Small gains may be model variability or human grading
noise. Inspect regressions and repeat uncertain comparisons; never claim significance from this
small starter suite. Preserve the complete runs. Comparing only successful subsets is not valid.

`--gate` returns a nonzero exit code if the candidate has a critical failure or any observed
pass-to-fail regression. It is a review signal, not an automatic scientific verdict or production
certification. Examples created with `eval:init --example` are prominently labeled and cannot be
compared with real app runs. Do not report example percentages as measured agent performance.

## Development loop

| When | Required evidence |
| --- | --- |
| A real failure is reported | Reproduce it with synthetic/public inputs; add a task or refine the rubric before the fix; describe the observable expected outcome. |
| Before changing prompts/tools/context/recovery | Record a baseline for affected tasks plus the four-case starter; keep model and environment fixed. |
| During the change | Make one explainable change and small commits; add boundary tests for new failure modes; run `npm run verify`. |
| Before the PR is ready | Run the matching candidate, inspect failures and regressions, and report counts and limitations in the PR. Run `npm run test:smoke` for app/desktop changes. |
| Before a model/SDK upgrade or release | Run the complete sixteen-case suite with repeats, plus the existing automated checks. Review critical failures independently of the average. |
| After shipping | Turn recurring user failures into cases, and keep a few fresh paraphrases/unseen cases for manual spot checks so we do not optimize only for memorized prompts. |

If a changed rubric or new case invalidates an old baseline, run both revisions against the new
suite; do not reinterpret earlier grades as if the new criteria had been measured. An evaluation
change and a model/harness change should be distinguishable in review. Two reviewers can score a
small sample independently to find ambiguous criteria before trusting them broadly.

A PR may honestly say `Live task reliability: not measured` and explain why. Unit tests or a
scripted Pi tool sequence must never be presented as real-model task success. The decision to
ship without that evidence stays explicit. CI validates the evaluation definitions and tests
the scorer offline; it does not launch real model trials or use account credentials.

The [Luna live runner](live-evaluations.md) now reuses the production prompt/tools with controlled
fixtures, automatic outcome checks and token counts. Automated control/grading of real desktop
apps, production transcript collection, currency cost measurement and a model judge remain future work.
