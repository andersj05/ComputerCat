# Windows workflow plan

Reviewed: 2026-09-23. Status: product direction adopted; delivery gates below are proposals
until their results are measured.

## Product promise

Computer Cat helps a person finish the next short task in the Windows app they are already
using. The cat should identify the target, use fresh context, make the requested change in that
app when supported, and report what it verified. The person can edit the request and stop work.

This focuses the existing [desktop context](desktop-context.md), [targeted input](computer-use.md),
local files, and [cat interface](windows-xp-design.md) on a repeatable experience. It does not
promise unattended management of every app or task. Meta's September 2026 [Muse launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)
already covers long-running goals, connected services, approvals and memory; its
[Mac app](https://ai.meta.com/muse/download/) reaches local files and apps. Mascot appearance,
generic autonomy, and privacy language alone do not establish the Windows workflow's value.

## Three jobs to prove

| Job | User-visible result | Acceptance evidence |
| --- | --- | --- |
| Explain this window | The cat names the intended app and gives a useful next step. | Fresh observation of the correct window; answer matches visible content and discloses missing access. |
| Draft a reply here | The cat inspects the app, asks for the user's intent, then leaves a draft there. | Recipient and editor contents checked after input; no send or unrelated edit. |
| Find or change a local file | The cat finds the requested file, makes a scoped change, and shows where it is. | File read-back and fresh file-manager observation when claiming it was revealed. |

Start with the owned fixtures in the [manual task catalog](../evals/catalog.json). Then run the
same jobs in real Windows apps chosen from pilot users' daily work. A synthetic pass is not a
real-app completion result. Report app name/version, model, attempt count, completion, elapsed
time, interventions, wrong targets, and any unintended action separately.

## Delivery sequence

1. **Make the jobs discoverable.** Replace generic empty-chat starters in both chat views with
   editable current-app requests. Sending remains a separate user action. This increment is
   implemented in [task starters](../src/renderer/src/task-starters.ts), [chat](../src/renderer/src/App.tsx)
   and [cat panel](../src/renderer/src/voice/PetVoice.tsx).
2. **Qualify the action loop.** Resolve the strict [computer-use lab](computer-use-testing.md)
   failures on an unlocked, idle desktop without weakening target, focus, user-input or
   cancellation checks. Run the guided draft, changed-editor and injection cases three times
   each with a fixed model, then test the same flow in at least three real apps. Record failures
   before changing the helper or prompts. The [2026-09-22 review](audits/2026-09-22-computer-use-opportunities.md)
   is the engineering starting point.
3. **Improve the measured bottleneck.** If helper startup dominates successful attempts, compare
   a bounded reusable helper against the same strict workload. If accessibility cannot expose a
   required browser control, evaluate structured browser access on that case. Keep the
   observe → act → verify contract in either route.
4. **Make outcomes legible.** Show which app is being acted on and distinguish attempted input
   from observed results in the activity UI. Add a clear review point before any new send,
   publish, purchase or delete capability. Avoid claiming task completion from a tool's
   successful return alone.
5. **Pilot the narrow promise.** Use a small set of Windows users and their actual apps. A
   proposed release gate is at least 90% verified completion on a fixed, limited task set, with
   zero wrong-target edits or unauthorized sends. Report per-app failures and interventions,
   not just an average. Revisit the target tasks if they are not important enough to repeat.

Defer broad service connectors, background goals, long-term personal memory, and another desktop
platform until the short Windows jobs are reliable and pilot users request the expansion.

## Current limits and claims

As of this review, the app has on-demand desktop reads and six targeted Windows input tools.
Arbitrary coordinate control, full browser integration, service connectors and selected-fact
user memory are not implemented. The strict native lab has unqualified attempts, and real-app
model completion remains unmeasured. See [current state](memory/current-state.md) and the
[computer-use review](audits/2026-09-22-computer-use-opportunities.md).

Local voice transcription and local chat storage are useful choices, but desktop observations
sent to a connected model leave the PC, saved transcripts are plaintext, and built-in file/shell
tools have OS user privileges. Describe those boundaries plainly; do not market the whole agent
as local or sandboxed. See [architecture](architecture.md).
