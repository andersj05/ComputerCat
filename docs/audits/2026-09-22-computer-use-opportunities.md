# Computer-use improvement review

Reviewed: 2026-09-22. Scope: the six agent tools, desktop broker, Windows input helper,
owned-window lab, and controlled live-model evaluations. This is a prioritized proposal,
not a measured improvement or a change to input policy.

## Evidence available now

- The [Windows adapter](../../src/main/desktop/windows-input.ts) starts a new hidden PowerShell
  process for every inspect and action. The [fixed helper](../../src/main/desktop/windows-input-script.ts)
  compiles its UI Automation code for each process, handles one request, then exits. The
  [broker](../../src/main/desktop/controller.ts) serializes calls, holds ownership through native
  process exit, and cancels on Stop, timeout, turn change, lock, sleep, and quit.
- The latest recorded [full strict lab run](../computer-use-testing.md#recorded-verification)
  passed 19 of 36 attempts. Sixteen attempts had `rejected:user-input` and one had
  `rejected:focus`. Every scenario passed at least once, but the full run is unqualified.
  The report's activity flags show input-tick changes on repeated refusals; they do not identify
  the source. Leave the native focus and input checks intact while investigating.
- Recalculation from the ignored 2026-09-22 full-run report gives 108 observed/dispatched calls
  belonging to attempts that passed every assertion. Their pooled median adapter call took
  1,542 ms; the pooled median elapsed time to the helper's ready marker was 830 ms. These are
  descriptive, mixed-operation figures. Ready time includes launch, initialization, compilation,
  and pipe scheduling; it is not an isolated compilation profile or a promised saving from reuse.
  The [report schema and rules](../../tests/computer-use/metrics.ts) exclude failed attempts from
  successful latency while retaining their outcomes.
- The [controlled live runner](../live-evaluations.md) uses real model requests with controlled
  desktop/web/file fixtures. This change adds one `draft-in-app` task using the
  [offline computer fixture](../../src/main/desktop/fixture-input.ts), real tool registration,
  broker validation and independent final-state grading. The scripted
  [six-tool worker flow](../../tests/smoke/codex.spec.ts) still tests wiring independently.
  The new live task has not been run with a model, and real-app completion is unmeasured.
  The [manual catalog](../../evals/catalog.json) defines additional drafting cases.

## Recommended order

| Priority | Change to evaluate | What would count as evidence |
| --- | --- | --- |
| 1 | Qualify the existing strict lab on an unlocked, idle desktop. Record all attempts and activity flags; investigate any recurring input-tick changes without weakening the guard. | All 36 planned attempts pass with no retries, missing coverage, or evidence issues. Preserve failed runs. |
| 2 | Prototype a bounded, reusable native helper for serial inspect/action calls. Give it request framing, an idle exit, process-owner checks, and a hard kill on cancellation, timeout, malformed output, or pipe failure. Never reuse an uncertain helper. | Offline lifecycle tests cover stale responses, crash, cancellation, and no overlapping input owners. A complete strict baseline/candidate pair with unchanged fixture and measurement code shows p50/p95 latency and outcome counts by operation. |
| 3 | Run the new controlled `draft-in-app` case, then add a follow-up reply, changed-editor recovery, and an untrusted-page instruction using independent state grading. | Three planned attempts per case at fixed model/settings. Report actual pass/fail counts, calls, latency, interventions, and critical failures. No paid model call in CI or ordinary tests. |
| 4 | Improve model-facing recovery only where traces reveal repeated refusal or unnecessary reinspection. Check action result size and token use before trimming evidence. | A matching controlled-model baseline/candidate improves completion or tool-call count without increasing wrong-target edits, duplicate actions, or unsupported success claims. |
| 5 | Evaluate structured browser access for pages where UI Automation cannot expose controls or app state. Keep connection and target selection explicit. | Separate browser fixture and real-app task results; compare completion and user interventions with the accessibility path. Do not infer broad app coverage from the synthetic forms. |

The first latency experiment should change helper lifetime only. It must preserve the consumed
observation contract, window/process/control fingerprints, input-tick and focus checks, post-action
inspection, and the distinction between dispatched and verified outcomes in the
[computer-use design](../computer-use.md). The strict lab's [comparison command](../computer-use-testing.md#read-and-compare-measurements)
already rejects incomplete or mismatched reports. A helper prototype is not ready to ship based
on one successful scenario or a fast rejected action.

For user experience, measure time to a verified draft and the number of manual focus handoffs,
not only adapter duration. The current [agent guidance](../../src/agent/runtime.ts) already tells
the model to search for missing named controls, ask for target-app activation after focus refusal,
leave drafts unsent, and verify recipient and editor contents. Change that guidance only after
observing a concrete failure in live-model traces or a real-app trial. UI Automation's inability
to expose a control cannot be fixed by a prompt alone.
