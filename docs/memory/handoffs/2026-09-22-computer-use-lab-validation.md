# Computer-use expanded lab qualification

Status: implementation complete; interactive qualification outstanding
Updated: 2026-09-22
Owner: computer-use test development
Branch: `feat/computer-use-lab`
Baseline: `b7be6e9` (lab branch based on `dev` at `c83485c`)

## Objective and scope

Improve computer-use boundary tests and the owned-window harness with frequent small commits.
Implementation through `2324108` is committed. The [lab workflow](../../computer-use-testing.md)
describes the twelve native/browser scenarios, offline tool loop, evidence rules and scope.
The production Windows input guard, model prompts and dependencies were unchanged.

Relevant sources: [stateful offline backend](../../../src/main/desktop/fixture-input.ts),
[real-tool integration checks](../../../tests/unit/computer-fixture.test.ts),
[scripted worker flow](../../../tests/smoke/codex.spec.ts),
[native scenarios](../../../tests/smoke/computer-input.spec.ts),
[browser scenarios](../../../tests/smoke/browser-input.spec.ts),
[fixture lifecycle](../../../tests/fixtures/input-test.ts),
[owned process protocol](../../../tests/fixtures/owned-window.ts),
[lab preflight](../../../tests/computer-use/setup.ts), and
[evidence reporter](../../../tests/computer-use/reporter.ts).

## Verification

At `2324108`, `npm run verify` passed memory/catalog checks, lint, types, 516 tests in 49 files,
and the production build. The offline scripted worker test exercises all six tools in nine calls,
including stale recovery, selection, Unicode replacement, scrolling and an unsent save.
Actual CLI runs with `--workers=2` and `--retries=1` failed in global setup before any fixture ran,
as intended. No paid model or real account was used.

The full `npm run test:smoke` run completed with 35/43 passing. Eight native-input scenarios
failed with `rejected:user-input`: the browser draft/Subject/textarea cases; native rename,
disable and hide recovery; native clearing; and the native click-pattern case. All remaining
application smoke checks passed, including the expanded worker flow and resize persistence.
The native draft/scroll scenario, resize recovery, replaced browser control and rich-editor
scenario passed in that run. Ordinary smoke can accept explicitly annotated focus refusals,
so it cannot substitute for a strict qualification report.

The resize assertion issue is resolved: three isolated repetitions and the full smoke check
passed. Exact native bounds are restored; transient live-resize renderer dimensions and tiny
floating-point differences were the old oracle failures. The evidence and intended contract
are documented in [desktop geometry checks](../../computer-use-testing.md).

A focused strict run of rich-editor replacement/selection/typing/clearing and the compact native
click-pattern scenario passed all six attempts (three each), with no coverage gaps or evidence
issues. The new checkbox, tab-selection and expand/collapse checks all dispatched correctly.
This qualifies only those two selected scenarios, not the expanded full matrix.

The subsequent full strict matrix recorded all 36 planned attempts: 19 passed and 17 failed
(sixteen `user-input` refusals, one `focus` refusal). Every one of the twelve scenarios passed
at least once. There were zero retries and no reporting errors; the reporter correctly refused
qualification. Durable results are in [recorded verification](../../computer-use-testing.md).

Interactive diagnostics repeatedly show changed input ticks with stable foreground ownership;
some attempts also show foreground changes. The source of activity is unknown. Refusals remain
failed attempts, no retries are hidden, and native protection checks remain intact. The
[protocol tests](../../../tests/unit/owned-window.test.ts) also verify that timeouts, crashes,
pipe errors and failed cleanup cannot silently reuse a delayed fixture response.

## Remaining work and next action

Use an unlocked, idle Windows desktop with no competing input/focus changes. Run
`npm run test:computer-use:lab` (twelve scenarios, three repeats each), then inspect all assertions,
activity flags and the version-2 report. Keep every attempt. The expanded full matrix and a
matching baseline/candidate timing comparison have not been qualified.

Real-app/live-model qualification remains separately tracked in
[the original handoff](2026-09-21-computer-use-validation.md). Once the expanded suite is qualified,
record the evidence in the lab document and remove this handoff.
