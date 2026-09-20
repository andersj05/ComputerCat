# Handoff: first local Luna evaluation run

Status: blocked on app sign-in
Updated: 2026-09-20
Owner: task owner
Branch: feat/context-tools-and-retro-icons
Baseline: b681e68

## Objective and constraints

Enable local task evaluations using gpt-5.6-luna with Medium reasoning, then measure a small
initial batch. The user authorized live subscription usage for these evaluations and asked
for frequent commits. Do not substitute a model, reuse global Codex/Pi credentials or create
an API-key connection. Normal CI remains offline.

## Work present

- `84d49b1`: local Electron host, production Pi adapter integration, controlled tool fixtures,
  twelve automatic task cases, grades, token counts and versioned reports.
- `ede14b2`: request/cancellation boundaries, stronger source/file evidence grading, CLI help.
- [Usage and scope](../../live-evaluations.md), [runner](../../../src/agent/evaluation/runner.ts),
  [host](../../../evals/live-main.ts), and [offline tests](../../../tests/unit/live-evaluations.test.ts).
- [PR #31](https://github.com/andersj05/ComputerCat/pull/31) remains open into dev.
  No unrelated working-tree changes were present after the implementation commits.

## Verification

On `ede14b2`, `npm run verify` passed: memory/catalog checks, lint, types, **384 tests** and build.
The thirteen new runner tests use an offline provider through the real Pi loop; they do not
establish Luna task success. CLI `--help` launches and exits correctly.

`npm run test:smoke` passed 28/29 checks. The cat-controls click assertion failed at
`tests/smoke/desktop.spec.ts:1108`; the same complete test passed on an isolated rerun with
`node node_modules/@playwright/test/cli.js test tests/smoke/desktop.spec.ts --grep "cat presence, direct controls, drag gestures, and motion preferences"`.
No renderer code changed in this increment. Record the initial failure; do not claim a clean
29/29 full smoke run for this revision.

Live preflight and the attempted four-case `luna-initial` run exited before initialization or
model calls because the saved app connection could not be unlocked. A local encryption
self-check passed. The normal application, launched with its usual profile, independently
reported the same disconnected/unlock-failure state through its existing info bridge. The
credential was not removed, modified or exported. No live score or initial run manifest exists.

## Remaining work and next action

The user has been asked to reconnect through Computer Cat → Options → Models and quit the app.
When that is done, recheck branch/status, then run:

1. `npm run eval:live -- --check`
2. `npm run eval:live -- --run luna-initial --repeats 1`
3. Inspect the generated report and synthetic traces; fix actual runner issues without
   relabeling failed trials. Use a new run name after code/grader changes.
4. Run a repeated baseline with the defaults when the initial run is valid, report the observed
   counts and usage with the controlled-fixture limitation, and remove this resolved handoff.

The live suite measures model decisions with synthetic accessible text, web pages, virtual
file/clipboard state and the production tool controllers. It does not operate real Windows
apps, browse public sites, test screenshots or traverse worker IPC. Keep the manual app suite
and Electron checks for those boundaries. Scores are not production reliability guarantees.
