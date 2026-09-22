# Computer-use keyboard and model qualification

Status: strict owned native/browser keyboard fixtures pass; real-app qualification remains
Updated: 2026-09-21
Owner: computer-use development task
Branch: `feat/computer-use`
Baseline: `dev` at `7759041`

## Objective and constraints

Let the cat use context from the intended app to draft and edit there. Preserve the existing
main/worker/renderer boundaries, keep drafts unsent, test only owned synthetic windows, and
commit small changes frequently. This first increment uses Windows accessibility controls;
coordinate input, dragging and a full browser connection are separate future capabilities.

## Work present

Core implementation is committed in `1a17926` through `40cc35a`; evaluation cases are in
`1eb6027`. Discovery follow-up adds name-filtered inspection, a deeper control-view walk, reduced
redundant traversal, corrected drafting guidance and multiline keyboard input. Evidence and
entry points are in [computer use](../../computer-use.md). Recheck the checkout on resume.

- [Six Pi tools](../../../src/agent/computer-tools.ts), registered through the private desktop
  channel, with observe/act/verify and draft-versus-send guidance in the runtime prompt.
- [Consumed observations](../../../src/main/desktop/computer-use.ts) and
  [validated contracts](../../../src/shared/computer-use.ts) retain one target set per turn.
- [Fixed Windows helper](../../../src/main/desktop/windows-input-script.ts) and its
  [process owner](../../../src/main/desktop/windows-input.ts) enforce native identity, stale
  contents, foreground/focus and cancellation checks. Chromium fill uses keyboard input so
  app input events occur; direct ValuePattern changes were insufficient for contenteditable.
- [Native](../../../tests/smoke/computer-input.spec.ts),
  [browser](../../../tests/smoke/browser-input.spec.ts), and scripted agent fixtures exercise
  targeting, drafts, rejection and recovery without real accounts or model calls.
- [Manual evaluations](../../../evals/catalog.json) add draft-in-app, draft-injection and
  changed-editor. The controlled-tool Luna runner still covers its original twelve tasks.

Durable design and limits live in [computer use](../../computer-use.md) and the
[browser input pitfall](../gotchas.md), not this handoff.

## Verification

- `npm run verify`: passed memory/catalog checks, lint, types, 431 tests in 43 files and build.
- The full desktop smoke run passed 32 checks and exposed dropped browser line breaks in the
  remaining check. After the fix, both affected native fixtures passed with strict focus
  qualification: actual typing/key dispatch, exact multiline values, browser input events,
  unsent status, and finding/clicking Reply beyond sixty controls. No focus-refusal substitution
  was accepted. Intermediate runs correctly rejected changed user input; the final run used
  a quiet interactive desktop.
- Live task reliability: not measured. No real account, message delivery or paid model run
  was used. Passing the scripted model loop does not grade model judgment.

## Remaining work and next action

Keep the feature PR in draft until real-app qualification is recorded. Strict owned native and
browser keyboard checks now pass. Still exercise clearing/replacing an existing rich draft,
selection/key behavior, Stop during typing and focus handoff in real Windows mail applications.
Do not bypass OS focus restrictions or weaken the success assertions to get a pass.

Then run the three new manual app tasks three times each, plus the standard four-case starter,
using the intended model and fixed environment. Record actual outcomes and critical failures;
the existing Luna controlled-tool runner does not evaluate native input. Inspect ordinary
browser forms, rich email editors, window switches and user takeover before treating the
feature as broadly qualified. Broader live trials require their normal connection and usage.

Recheck current branch, status, instructions and user authorization before resuming. Remove
this handoff after its validation gaps have been resolved and the evidence is in durable docs.
