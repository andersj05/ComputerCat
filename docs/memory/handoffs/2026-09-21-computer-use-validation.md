# Computer-use keyboard and model qualification

Status: initial implementation ready for review; interactive qualification remains
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
`1eb6027`. The documentation/qualification change containing this handoff completes the current
checkpoint. There were no unrelated pre-existing edits. Recheck the actual checkout on resume.

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

- `npm run verify`: passed memory/catalog checks, lint, types, 426 tests in 43 files and build.
- `npm run test:smoke`: all 33 tests passed against the final native implementation and current
  evaluation cases. After the final guide and qualification-mode edits, both native fixtures
  and the guide smoke check passed again (3 tests). Wide and narrow guide screenshots were inspected.
- With `COMPUTERCAT_REQUIRE_NATIVE_FOCUS=1`, the browser test failed specifically because
  Windows denied foreground focus. No browser text was injected. Default smoke coverage
  checks unchanged fields on that refusal; it is not a successful keyboard-input trial.
- Native WPF fill, save without send, scrolling and stale-field/window rejection succeeded.
  Keyboard typing/key success and Chromium keyboard replacement remain unverified on this host.
- Live task reliability: not measured. No real account, message delivery or paid model run
  was used. Passing the scripted model loop does not grade model judgment.

## Remaining work and next action

Keep the feature PR in draft until interactive qualification is recorded. From an interactive
Windows terminal that can activate its own fixture, run `npm run test:computer-use` with
`COMPUTERCAT_REQUIRE_NATIVE_FOCUS=1`. Both native and browser paths must actually dispatch and
produce the exact Unicode/multiline editor values, with browser input events and unsent status.
Also exercise clearing/replacing an existing rich draft, selection/key behavior, and Stop during
typing. Do not bypass OS focus restrictions or weaken the success assertions to get a pass.

Then run the three new manual app tasks three times each, plus the standard four-case starter,
using the intended model and fixed environment. Record actual outcomes and critical failures;
the existing Luna controlled-tool runner does not evaluate native input. Inspect ordinary
browser forms, rich email editors, window switches and user takeover before treating the
feature as broadly qualified. Broader live trials require their normal connection and usage.

Recheck current branch, status, instructions and user authorization before resuming. Remove
this handoff after its validation gaps have been resolved and the evidence is in durable docs.
