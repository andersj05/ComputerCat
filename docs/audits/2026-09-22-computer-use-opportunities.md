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
  GPT-6 Luna / Medium passed the new case in 3/3 controlled attempts on 2026-09-22;
  real-app completion is still unmeasured.
  The [manual catalog](../../evals/catalog.json) defines additional drafting cases.

## GPT-6 Luna live observations (2026-09-22)

The first 12-task controlled run passed 8/12 with two critical scope failures. A later
13-task run after [tool guidance](../../src/agent/runtime.ts) passed 10/13, including
the file edit and reveal tasks that previously lacked fresh verification. These runs
have different suites and one attempt per task, so their totals are not a matched
completion-rate comparison. A three-attempt research retry after source-specific
guidance passed 7/9: partial source failure 3/3, source comparison 2/3, and account
follow-up 2/3. Raw traces and reports are kept only in ignored `.local/evals/`.

Luna sometimes called shell with a no-op or passed web URLs to the local file reader
before using web tools. The changed guidance has not eliminated those extra calls.
The file edit and file reveal checks now explicitly ask for read-back and fresh
observation; those actions passed in the later one-attempt run. These are controlled
fixtures, not Windows app or public web results. Measure repeated, matching runs
before claiming a completion or latency improvement. The next research-harness
experiment should reduce irrelevant tool exposure without hiding tools needed by
compound tasks, then compare tool calls, token use, and scope failures.

## Recommended order

| Priority | Change to evaluate | What would count as evidence |
| --- | --- | --- |
| 1 | Qualify the existing strict lab on an unlocked, idle desktop. Record all attempts and activity flags; investigate any recurring input-tick changes without weakening the guard. | All 36 planned attempts pass with no retries, missing coverage, or evidence issues. Preserve failed runs. |
| 2 | Prototype a bounded, reusable native helper for serial inspect/action calls. Give it request framing, an idle exit, process-owner checks, and a hard kill on cancellation, timeout, malformed output, or pipe failure. Never reuse an uncertain helper. | Offline lifecycle tests cover stale responses, crash, cancellation, and no overlapping input owners. A complete strict baseline/candidate pair with unchanged fixture and measurement code shows p50/p95 latency and outcome counts by operation. |
| 3 | Add a follow-up reply, changed-editor recovery, and an untrusted-page instruction to the controlled draft case using independent state grading. | Three planned attempts per case at fixed model/settings. Report actual pass/fail counts, calls, latency, interventions, and critical failures. No paid model call in CI or ordinary tests. |
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
