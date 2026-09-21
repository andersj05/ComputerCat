# Luna/Medium development baseline

Reviewed: 2026-09-20. Mode: **live model with controlled tool fixtures**.
This measures the agent's choices and outcomes against synthetic state, not general Windows,
public-web, screenshot, or production reliability. No before/after improvement is claimed.

## Measured run

- Command: `npm run eval:live -- --run luna-active-baseline --repeats 3`
- Model: `gpt-5.6-luna`; reasoning: Medium; app-owned ChatGPT/Codex connection.
- Revision: `4d64041da50b0061d6088519e6d052cecdd41e6a`; clean checkout at initialization.
- Application hash: `5e4b5caf8d7150d3af36306282abb23943c5794f1fb60f820015f571047d7495`.
- Suite hash: `b3aeb2fdcd5ce50ea046723c3eb76083acab9c6eda6050f13669421a7cb85cdf`.
- **12/12 attempts passed**, all four tasks passed every attempt, **zero critical failures**.
- 28 model requests; 167,682 provider-reported tokens including cached input.
  Reasoning tokens are already included in output. These counts do not establish currency
  cost or a percentage of subscription usage.

| Task | Passed | Attempts |
| --- | ---: | ---: |
| Screen summary | 3 | 3 |
| Account follow-up | 3 | 3 |
| Clipboard copy | 3 | 3 |
| Partial source failure | 3 | 3 |

Each attempt used a fresh in-memory conversation and fixture state. The scorer checked outcomes,
supporting reads/actions, and unrelated side effects. Different valid tool sequences were accepted;
for example, account follow-up used either direct profile reading or search followed by reading.
The first four-case connection check on `afb2e8f` also passed 4/4, using 10 requests and 60,020
reported tokens. It is not a matched comparison with this run because harness inputs changed.

The full manifest, synthetic traces and report remain in ignored
`.local/evals/luna-active-baseline/`. Raw tool logs, credentials and personal data are not committed.
The subsequent run reused the saved app connection after restart without another sign-in.

## Engineering checks

On `4d64041`, `npm run verify` passed: memory/catalog validation, lint, types,
**396 tests**, and build. The final `npm run test:smoke` passed **30/30**.
An earlier smoke run overlapped live-app work/builds and passed 27/30, with startup, cat-control
and resize failures. After closing the evaluator-owned app and serializing verification, the
complete suite passed. Keep desktop smoke runs separate from live evaluation builds/windows.
The [connection regression](../../tests/smoke/evaluations.spec.ts) specifically proves that the CLI
uses an active app login even if its synthetic saved vault becomes unreadable.

Use the [development workflow](../live-evaluations.md) for another run. Three attempts per task
are a small development sample; this is a starter baseline, not proof that all 35 tools or all
combinations work. The other eight scenarios, real desktop/browser spot checks, and broader
repetitions remain separate coverage.
