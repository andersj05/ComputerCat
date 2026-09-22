# Computer-use expanded lab qualification

Status: implementation complete; interactive qualification outstanding
Updated: 2026-09-22
Owner: computer-use test development
Branch: `feat/computer-use-lab`
Baseline: `b7be6e9` (lab branch based on `dev` at `c83485c`)

## Objective and scope

Improve computer-use boundary tests and the owned-window harness with frequent small commits.
The expanded [lab workflow](../../computer-use-testing.md) describes the implemented matrix,
evidence rules and scope. Production tools, model prompts and dependencies were unchanged.

## Work present

- `7d06fd1`: version-2 roster, timing and attachment validation; explicit coverage reporting.
- `7d01631`: action cancellation, stream failure, replacement identity and reference recovery tests.
- `64c1c59`: shared fixture lifecycle; native resize/rename/disable/hide recovery and read-only refusal.
- `55f91d1`: per-editor replacement, multiline normalization, selection, Unicode typing, clearing,
  and replaced DOM control refusal. Empty rich editors allow Chromium's caret placeholder only.
- `428dd0e`: abort outstanding native helpers and await exit before final measurement attachment.

Sources: [fixtures](../../../tests/fixtures/input-test.ts),
[native scenarios](../../../tests/smoke/computer-input.spec.ts),
[browser scenarios](../../../tests/smoke/browser-input.spec.ts),
[recorder lifecycle](../../../tests/unit/owned-input.test.ts).
All implementation is committed. Final documentation is committed with this handoff.

## Verification

At `428dd0e`, `npm run verify` passed memory/catalog checks, lint, types, 488 tests in 46 files,
and the production build. No model or account was used. Subsequent changes were documentation only.

The full `npm run test:smoke` run at that revision finished with 30/42 passing. All eleven
computer-use scenarios failed on native action rejections (explicit `user-input` reasons appeared
repeatedly; some status-only assertions did not print the reason). The unchanged cat-panel resize
test also failed on reopened dimensions differing by 2 DIP in width and 1 DIP in height.
An isolated rerun of that test failed earlier on strict floating-point equality:
174 versus 174.00003051757812 for the cat width. That separate geometry assertion remains
unresolved; neither its test nor production UI code changed here.

Focused Windows runs exercised the new native rejection/recovery cases, subject and textarea
selection/replacement/clearing, and replaced DOM control refusal. A rich-editor trial reached
all operations but exposed an overly strict empty `innerText` oracle: Chromium retained a
caret line break. The corrected oracle requires empty text content and at most one placeholder
line. Its subsequent trial hit `rejected:user-input` during selection before reaching clearing.

Interactive runs repeatedly hit the native `user-input` guard between observation and action.
These are failed attempts, not keyboard qualification. The guard detects changed foreground
ownership or input ticks; no exact source of that activity was established. No refusal was
reclassified as a successful edit, no retry was hidden, and native protection checks were unchanged.

## Remaining work and next action

Arrange an unlocked, idle Windows desktop with no competing input/focus changes. Run
`npm run test:smoke`, then `npm run test:computer-use:lab` (eleven scenarios, three repeats each).
Inspect every failed assertion and the version-2 evidence report, especially rich-editor clearing.
Investigate the existing cat-panel resize assertions separately; do not hide dimensional regressions
by widening tolerances without checking the intended DPI/rounding behavior.
Keep all attempts; do not select earlier passing samples as a full qualification result.

A full strict pass on the expanded matrix and a matching baseline/candidate timing comparison
have not been established. Real-app/live-model qualification remains separately tracked in
[the original handoff](2026-09-21-computer-use-validation.md). Once the expanded suite is qualified,
record the evidence in the lab document and remove this handoff.
