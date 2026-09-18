# Handoff: implement local Whisper speech input

Status: preparation complete; implementation not started
Updated: 2026-09-17
Owner: next Computer Cat speech-input implementer
Branch: `feat/voice-desktop-research`
Baseline: `a8bba11` inspected; branch originally based on `dev` at `2acff1b`
Specification commit: `039e180`

## Objective and constraints

Implement local speech-to-text using Whisper `large-v3-turbo` through `whisper.cpp` in the
existing Windows-first Electron app. The user chose free local recognition and requested
detailed implementation preparation, a handoff, correct repository updates and incremental
commits. This handoff completes that preparation and describes the future implementation.
It is not a record of an implemented feature or a grant to record a live microphone.

Keep existing Pi reasoning and the app-owned Codex connection. No speech API key, paid fallback,
subscription-token reuse or global Codex/Pi configuration changes. Voice is disabled by default;
model installation and microphone capture are explicit user actions. The first complete flow
produces editable text in the composer, followed by normal Send. Speech output, screenshots,
desktop automation and always-listening are outside this implementation milestone.

Follow root [AGENTS.md](../../../AGENTS.md), [memory guide](../README.md),
[current state](../current-state.md), [README](../../../README.md),
[contributing](../../../CONTRIBUTING.md), [architecture](../../architecture.md), and
[XP guidance](../../windows-xp-design.md). Read the three specification files before coding.

## Work present

| Commit/document | What it contains |
| --- | --- |
| `a8bba11` | Original speech/screen/desktop research; no application changes |
| `039e180` | Local Whisper design, contracts, delivery/evaluation checklist, D009 and corrected cloud-first research |
| [Design and module map](../../implementation/whisper/README.md) | Scope, user flow, planned files, process boundaries, model choices, native packaging and privacy behavior |
| [Boundary contracts](../../implementation/whisper/contracts.md) | Exact proposed IPC, state/limits, microphone permissions, audio format, helper framing, cancellation and download rules |
| [Delivery checklist](../../implementation/whisper/delivery.md) | W0-W4 implementation order, commit suggestions, boundary tests, evaluation cases and completion criteria |
| [D009](../decisions.md#d009-use-local-whisper-for-the-first-speech-input) | Adopted local-input direction, proposed engineering defaults and unresolved artifact/performance gates |
| This handoff and navigation updates | Added after `039e180`; find their containing commit in Git history |

No application source, package dependency, build configuration or test behavior changed during
preparation. No native executable, weights, real recording or speech/model API call was made. Planned
source paths in the design are a blueprint, not pre-existing scaffolding. There were no
unrelated pre-existing working-tree changes. All preparation files are intended to be committed
before this handoff is delivered; verify actual status on resume rather than assuming it.

## Verified facts and implementation decisions

- The current [agent runtime](../../../src/agent/runtime.ts) accepts text. Whisper text can use
  existing [Send](../../../src/main/chat-controller.ts) without altering the Pi worker protocol.
- [Main](../../../src/main/index.ts) currently denies all browser permissions and validates IPC
  sender, main frame, exact URL and chat/pet roles. Add a narrow microphone policy, not a blanket
  media permission. Inspect pinned Electron types as well as docs.
- [App](../../../src/renderer/src/App.tsx) already tracks draft revisions and per-chat in-memory
  drafts. Extend those guards for late transcripts and pending review text.
- Existing Stop entry points are the chat UI, pet, tray and `Ctrl+Shift+Escape`. All must reach
  the same voice cleanup path as well as agent cancellation.
- Production CSP blocks renderer networking. Keep downloads and native supervision in main;
  verify the worklet's emitted local asset URL in the actual packaged app.
- Existing saved conversations contain plaintext sent text and native Pi context. Do not store
  recordings or unsent transcripts there. Current shell tools run with user privileges; a
  speech helper is crash isolation and does not introduce an agent security sandbox.
- Candidate engine release v1.9.4 and its C API were read from upstream. Neither its artifacts
  nor any model were downloaded or tested. Full hashes, build/runtime dependencies and actual
  model/backend performance remain open W0 gates.

The specification selects a persistent native helper with private pipes, chat-owned PCM
capture, explicit model installation, GPU Auto with CPU fallback, manual recording finish,
and draft review. These are implementation defaults derived from the chosen Whisper approach.
Do not reopen the vendor comparison before checking the concrete native feasibility gates.

## Verification of the preparation

- `npm run memory:check`: passed on the core specification before `039e180` (22 Markdown files).
- `git diff --check` and staged diff check: passed for `039e180`.
- Final handoff/navigation changes: checked with `npm run memory:check` and `git diff --check`
  before their commit; 23 Markdown files, including this handoff, are covered.
- Application `npm run verify`, desktop smoke, native compilation, real Whisper inference,
  live microphone use, model downloads and GPU benchmarks were not run for Markdown-only
  preparation. No runtime capability or latency claim follows from the documentation checks.

On the preparation machine, npm's PowerShell shim referenced a missing roaming npm CLI. The
checks used Node with the installed npm CLI directly. Use a working local Node/npm installation
on the receiving machine; no machine-specific absolute paths are required by the repository.

## Concrete next action

1. Inspect branch, working tree and log. Preserve unrelated work. Follow the
   [branch procedure](../../implementation/whisper/delivery.md#prerequisites-and-branch-handling):
   land preparation into dev, or explicitly integrate its commits into an implementation branch
   based on current dev. Do not assume this branch is pushed, merged or has an open PR.
2. Start **W0** in the delivery checklist. Resolve v1.9.4 to a full commit; create the native
   build/dependency and model catalogue manifests with verified real artifacts and notices.
   Record why any candidate version changes. Never commit weights, build output or placeholders
   that a runtime would treat as valid checksums.
3. Prove CPU load/transcription, then CUDA selection, native cancellation, parent-loss exit,
   and execution from an unpacked app directory. This establishes the hard integration risks
   before extensive UI work. Use a licensed sample or explicit user-controlled recording.
4. Continue W1-W4 in order, committing coherent slices. Implement boundary behavior tests
   alongside each slice. Keep default CI offline and free of live microphone/paid model calls.
5. Before a PR run `npm run verify`; desktop changes also require `npm run test:smoke` and
   the specified packaged tests. Update actual capabilities in memory/docs only when they work.

There is no unanswered product question blocking W0. Technical unknowns are model/VAD artifact
hashes and licensing inventory, native Windows toolchain/runtime distribution, GPU fallback,
worklet loading and measured accuracy/latency. Resolve them with evidence rather than marking
the feature ready from mocked tests. Remove this handoff when implementation is complete and
its lasting findings have been incorporated into the maintained documentation.
