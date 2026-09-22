# Computer-use test lab

Reviewed: 2026-09-22. Scope: deterministic Windows UI Automation and native keyboard fixtures.

The lab repeatedly runs the real [Windows input adapter](../src/main/desktop/windows-input.ts)
against an owned WPF editor and an owned Electron/Chromium email form. No models, accounts,
network service, clipboard, or arbitrary desktop enumeration are needed. Target handles come
from the fixture processes. Tests close their windows and use temporary browser data.

## Run the lab

Use the repository's pinned Node/dependency versions on an interactive Windows desktop:

```powershell
npm ci
npm run test:computer-use:lab
```

The full matrix has eleven scenarios: six native and five Chromium, each repeated three times
(33 attempts), serially and without retries. It requires actual keyboard dispatch and verified
values/events. Strict runs return a failing exit code when coverage is skipped or incomplete. Leave the desktop idle while it runs; minimize other
always-on-top apps that could obscure the fixtures. Do not type or switch windows during a run.
The test never overrides Windows foreground restrictions. A VM needs an unlocked, active
interactive desktop; a service or disconnected remote session is not keyboard qualification.

Use `--grep` for a focused scenario subset; qualification applies only to the selected roster,
not the full matrix. The report lists every selected scenario.

For more samples, use `npm run test:computer-use:lab -- --repeat-each=10`. The fixture matrix is
selected in [the lab configuration](../computer-use.config.ts). No application build is needed.
For a full application check, also run `npm run verify` and `npm run test:smoke` sequentially.

For a hosted runner or a machine where foreground activation is unavailable:

```powershell
$env:COMPUTERCAT_INPUT_LAB_MODE = 'diagnostic'
npm run test:computer-use:lab -- --repeat-each=1
Remove-Item Env:COMPUTERCAT_INPUT_LAB_MODE
```

Diagnostic mode accepts only the existing explicit focus-refusal cases, verifies that refused
edits did not change the fixture, and records the missing coverage. It cannot qualify keyboard
success or serve as a performance comparison. Other errors still fail. Windows CI runs this
mode before packaging and uploads reports even when the check fails. Ordinary
`npm run test:computer-use` retains its original smoke-test behavior.

## What is checked

| Fixture | Observable success and regression checks |
| --- | --- |
| WPF editor | Exact Unicode draft, save without sending, changed text and moved window rejected, typing, Control+A selection length, scroll offset, read-only/protected controls; separate resize, rename, disable and hide/recovery cases; empty replacement and native read-only refusal |
| Chromium form | Subject, multiline textarea and existing contenteditable replacement; CRLF/CR/LF normalization; Control+A selection, Unicode insertion and empty replacement per editor; actual input events; replaced DOM control rejection; no plain Enter; unchanged recipient; unsent draft; finding/clicking a nested Reply after seventy toolbar controls |
| Offline app-state fixture | Real six-tool registration and desktop broker against independent editor/selection/scroll/save state; stale and read-only refusal; cancellation; per-instance isolation |
| Offline boundary tests | Consumed/expired/cross-turn references, cancellation and process ownership, invalid requests, provider errors, ambiguous outcomes; included in `npm run verify` |

The shared [fixture lifecycle](../tests/fixtures/input-test.ts) creates fresh owned windows per
scenario and always attaches measurements and closes child processes, including after assertions fail.
Input teardown aborts any outstanding helper and waits for its exit before recording final samples
or starting another scenario; [offline lifecycle tests](../tests/unit/owned-input.test.ts) cover this.

The [native fixture](../tests/smoke/computer-input.spec.ts) and
[browser fixture](../tests/smoke/browser-input.spec.ts) use application state to check success.
Playwright reads the owned browser DOM as an independent oracle; edits being measured go
through WindowsInput, not Playwright typing. Its focus emulation does not prove native focus.
Reviewed 2026-09-22: an emptied Chromium contenteditable retains a caret line break. The
[editing oracle](../tests/smoke/browser-input.spec.ts) checks exact empty text content and at most
one placeholder line, while checking actual input events; it does not trim leftover user text.
The synthetic Send button only changes fixture state; no message can leave these forms.

## Read and compare measurements

Each lab run prints a new `.local/computer-use/<timestamp>/` directory containing `report.json`
and `report.md`. The reporter saves progress after each completed attempt and records final
failure/interruption status. Version-2 reports retain the exact planned test roster, retries,
per-attempt coverage gaps and sanitized reporting errors. Duplicate/missing attempts, missing or
invalid attachments, and missing/out-of-order helper markers fail evidence validation in both modes.
Diagnostic mode permits only asserted focus refusals with a recorded coverage gap; it never qualifies.
An abruptly killed process may leave a `running` report, which cannot qualify. Playwright diagnostics
remain in `test-results/computer-use-lab/`.
Refused/uncertain actions include privacy-preserving flags for foreground and input-tick changes,
when a post-action snapshot exists. These do not identify which app or person caused activity.
Failed ordinary smoke checks also print their final three measurement records for diagnosis.
Reports contain synthetic operation labels and timing/environment metadata, never screenshots,
editor contents, credentials or native handles. Generated files are ignored by Git.

The [recorder](../tests/fixtures/owned-input.ts) uses a monotonic clock for:

- Total adapter call latency, including process launch, script compilation, native work,
  post-action observation, pipe closure and schema parsing.
- Elapsed time to receiving the helper's existing fixed init/ready/request stderr markers.
  Ready includes initialization/compilation; it is not a precise CPU profiler or isolated
  compilation duration. Pipe scheduling/buffering can affect marker arrival times.
- Every observed, dispatched, rejected, uncertain or thrown outcome. Raw sample order is
  preserved, including the first call of every attempt. Every call starts a fresh helper;
  there is no discarded warm-up or persistent-process measurement.

The summary gives p50/p95 using nearest-rank percentiles. Only observed/dispatched calls from
attempts that pass all assertions contribute to successful latency. Expected stale, unavailable
and unsupported rejections and focus refusals remain visible as outcome counts. This prevents a fast refusal or an
incorrect edit from looking like an optimization. The test oracle's own polling and fixture
startup are outside adapter latency and included in overall attempt duration.

```powershell
npm run test:computer-use:compare -- .local/computer-use/BASELINE/report.json .local/computer-use/CANDIDATE/report.json
```

The comparison fails closed unless both reports are complete strict passes with the same
environment fingerprint, fixture/measurement hash, repetitions, operation mix and outcomes.
Version-1 reports cannot be compared with version-2 runs; collect a fresh baseline.
It permits a changed production helper and records commit, dirty-worktree status, and helper
hash. Keep display scaling, machine, power mode and background load fixed too: the automatic
fingerprint does not prove those conditions. Small sample counts are descriptive evidence;
there is deliberately no arbitrary millisecond CI gate or claim of statistical significance.

## Improvement workflow

1. Reproduce a failure in an owned fixture and assert the intended app state. Collect a strict
   baseline on the same fixture revision that will test the candidate.
2. Inspect total and helper-ready timings before choosing an optimization. A high ready share
   points toward helper startup/compilation; traversal, input and post-action work need finer
   profiling if the remainder dominates. Do not remove identity/focus checks to lower latency.
3. Change one production behavior, run offline boundary tests and full verification, and repeat
   the strict lab. Compare equal workloads and review failures before timing differences.
4. Keep real-app and live-model evidence separate. See [computer-use scope](computer-use.md)
   and [task evaluations](task-evaluations.md). These two fixtures do not establish Outlook,
   arbitrary browser, model judgment, Stop-mid-edit, or real-user takeover reliability.

Start a dedicated Windows VM with the same runtime versions and an interactive desktop when
repeatability or disruption becomes a problem. VM provisioning and real-account trials are
outside this first lab; the repository runner is reusable there without a paid-model connection.


## Desktop geometry checks

Reviewed 2026-09-22: at 125% scaling, the cat-panel resize smoke test observed identical
requested/native bounds before and after reopening, while Chromium's live-resize viewport
reported a transient 1–2 DIP difference. The [resize check](../tests/smoke/desktop.spec.ts)
uses exact native bounds for persistence and keeps renderer layout/anchor checks separately.
Artwork bounding boxes use 0.001 CSS-pixel precision to exclude floating-point representation
noise (observed as 174 versus 174.00003051757812), not to permit visible resizing.


## Offline tool-loop coverage

Reviewed 2026-09-22: the [stateful backend](../src/main/desktop/fixture-input.ts) models three
editors, save/send buttons, scroll offsets and a read-only control. The
[integration tests](../tests/unit/computer-fixture.test.ts) invoke the real agent tools and
DesktopController, then inspect a separate state oracle. Key selection, Unicode replacement,
clearing and scroll must change state; unimplemented fixture keys return unsupported instead
of an unconditional success. This covers tool/broker behavior without an interactive desktop.
It does not simulate native focus, UI Automation patterns, browser input events or model judgment.

The [scripted worker smoke test](../tests/smoke/codex.spec.ts) also traverses the actual worker,
tool bridge and renderer using an offline model response stream. Its nine calls exercise all six
tools, stale-reference recovery, selected-text replacement, Unicode, scrolling and saving an
unsent draft. The test checks the resulting draft and every tool's visible activity label.
