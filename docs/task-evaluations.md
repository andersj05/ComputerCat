# Measuring task reliability

Reviewed: 2026-09-20. The first suite evaluates the actual Computer Cat app with human-reviewed
outcomes. The [task catalog](../evals/catalog.json) contains twelve representative tasks and
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
The rubric is our product definition, not a claim of benchmarked agent quality. No live-model
reliability baseline has been measured yet.
