# Local live evaluations with Luna

Reviewed: 2026-09-20. This runner uses **gpt-5.6-luna with Medium reasoning** through Computer Cat's
existing Codex subscription connection. It makes real model requests when explicitly launched.
Normal `npm run verify` and CI stay offline. There is no fallback model or API-key connection.
The pinned Pi 0.85.1 catalog contains this model and reasoning level; OpenAI's
[Luna documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna) also lists Medium.
Subscription usage percentages and currency cost are not inferred from API token prices.

## Run it

Connect in Computer Cat → Options → Models first, then **quit Computer Cat**. The evaluation host
uses the same single-instance lock to avoid concurrent refresh-token rotation. It preserves chats,
model defaults and preferences; only a needed OAuth refresh updates the existing encrypted credential.
It reads no global Codex/Pi login, production chats, desktop windows or actual clipboard content.

```sh
npm run eval:live -- --check
npm run eval:live -- --run luna-baseline
```

The first command checks local sign-in and model availability without a model call. The second
runs four starter tasks three times each: screen summary, account follow-up, clipboard copy and
partial source failure. There are **12 attempts**, each with a fresh in-memory conversation and
fixture state. The scorer runs automatically. Use unique run names; previous results are never
replaced or retried silently. A failed attempt stays failed.

```sh
npm run eval:live -- --run luna-quick --repeats 1
npm run eval:live -- --run luna-full --tasks all --repeats 3
npm run eval:live -- --run luna-search --tasks keyless-search,account-followup --repeats 3
```

`--tasks` accepts comma-separated IDs from the [live catalog](../evals/live-catalog.json), or `all`.
`--repeats` accepts 1–3. The complete suite is twelve tasks / 36 attempts. If you deliberately use
a different Computer Cat profile, `--user-data ABSOLUTE_PATH` selects that app profile's encrypted
connection. Do not provide a key or token on the command line.

If preflight cannot unlock the saved connection, reconnect in the app and quit it before retrying.
It does not remove credentials or start a new login automatically. A valid saved connection still
needs server-side model entitlement and available usage; preflight alone cannot verify those.

## What is measured

Luna runs through the production [Pi runtime](../src/agent/pi-runtime.ts), system prompt and all
35 tool definitions. The [fixture adapters](../src/agent/evaluation/fixtures.ts) replace tool
execution with controlled synthetic state. The actual desktop/web controllers still validate
requests, extract pages, manage source references and perform browser-search recovery. The live
runner calls this runtime directly inside its separate host; it does not exercise the app worker
IPC or renderer. Those paths remain covered by the Electron integration suite.

| Component | Live evaluation behavior |
| --- | --- |
| Model and tool selection | Real Luna/Medium requests through Pi, including multi-turn context |
| Desktop | Synthetic accessible note/selection, changed page and file-manager state; no OS observation |
| Web | Fixed HTML sources and a forced search challenge; no live website/DNS/browser session |
| Clipboard | Isolated in-memory text; your clipboard is untouched |
| File read/edit/write | Actual Pi implementations with virtual storage limited to the fixture todo.txt |
| Shell, ls, find, grep | Registered definitions with blocking adapters; attempts are recorded and fail the scope criterion |
| Stop/resume | Runtime streaming cancellation and the next turn; actual UI responsiveness remains a smoke/manual check |

The twelve tasks are adaptations of the [manual app suite](task-evaluations.md). Fact-extraction
prompts request JSON so deterministic graders can check values and sources without paying for a
second model judge. File/clipboard tasks inspect their resulting state. Grading separately checks
the outcome, supporting tool evidence, and unrelated actions. Facts guessed without a source do
not pass the evidence criterion. Graders and fixtures are product assumptions: inspect traces,
and do not treat a mechanically accepted answer as general reasoning quality.

**This measures live-model behavior against controlled tools. It is not an end-to-end Windows,
public-web, or screenshot accuracy score.** Keep real-app spot checks and offline Electron tests.
Reports label the mode and refuse comparisons with manual or synthetic example runs. All twelve
cases use accessible text; image/vision quality is outside this suite.

## Limits, traces and comparisons

Each attempt allows at most six model requests, twelve executed tool attempts and 90 seconds.
The entire batch permits at most 96 model requests. Agent and provider HTTP retries are disabled.
The pinned Codex transport does not map `maxTokens` into its request body, so the runner does not
claim a hard token cap. Request/time limits bound runaway loops; token usage is measured afterward.
A provider failure stops the batch; remaining trials stay unscored, with no complete pass rate.
Ctrl+C requests cancellation and lets a completed credential rotation save before shutdown;
the launcher force-stops an unresponsive host after 35 seconds. Already saved attempts remain
available; an interrupted current attempt may remain unscored. Do not combine an interrupted run with cherry-picked retries.

Runs stay in ignored `.local/evals/RUN/`: a manifest, fresh fixtures, one JSON trace per completed
attempt and a Markdown report. Traces contain only synthetic task responses/tool inputs/results,
observed fixture state and provider-reported token counts. They exclude credentials, request
headers and reasoning text. Reasoning-token counts, when available, are already included in
output tokens. A cancelled/error response may report incomplete usage; counts are not an account
billing ledger. Keep traces local and review before sharing.

```sh
npm run eval:report -- --run luna-baseline
npm run eval:compare -- --baseline luna-baseline --candidate luna-candidate
```

Finish a baseline, make one harness change, then run a matching candidate with the same tasks and
repetitions. Source, fixture, rubric, runner and limits are recorded; changes during a batch halt
it before another trial. Changing fixtures or grading requires a new baseline. Live grades cannot
be overwritten with the manual scoring command. Investigate task regressions and critical failures,
then repeat uncertain differences: three trials per task remain a small development sample.

Implementation: [runner](../src/agent/evaluation/runner.ts), [graders](../src/agent/evaluation/grade.ts),
[local host](../evals/live-main.ts), and [offline boundary tests](../tests/unit/live-evaluations.test.ts).
The production worker never populates test adapters; they cannot be enabled through the renderer
or an application preference. The local runner is separate from packaged application entry points.
