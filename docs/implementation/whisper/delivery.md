# Whisper delivery checklist and evaluation

Reviewed: 2026-09-17. Status: all implementation slices below are pending. This is the work
breakdown for the [design](README.md) and [contracts](contracts.md), not a record of passing tests.
Complete a narrow end-to-end slice before adding more model choices or voice polish.

## Prerequisites and branch handling

Start by reading [AGENTS.md](../../../AGENTS.md), the [memory guide](../../memory/README.md),
[current state](../../memory/current-state.md), and the task handoff listed in its
[index](../../memory/handoffs/README.md). Inspect Git status/history before touching files.
The preparation branch is `feat/voice-desktop-research`, based on `dev` at `2acff1b`.
Do not treat these historical commit IDs as the receiver's current checkout.

Land the documentation through the normal feature-to-dev flow, then start the implementation
branch from current `dev` (suggested name `feat/local-whisper-input`). If documentation has not
landed, preserve it on its branch and explicitly integrate the preparation commits into a new
feature branch based on current dev. Do not reset another contributor's work or create an
implementation branch that accidentally omits the specification. No merge, push, PR or
remote state is implied by this checklist.

Use the Node version and exact dependencies in the repository. A native build adds CMake and
a Windows C++ toolchain for developers/CI; end users should not need them. Do not upgrade
Electron/Pi or add a paid speech service merely to implement local transcription.

## Ordered implementation slices

### W0. Freeze artifacts and prove the native approach

- [ ] Read the candidate `whisper.cpp` v1.9.4 release/header/build instructions; resolve the tag
  to a full immutable commit. Record compiler, CMake, Windows x64 target, backend build flags,
  native JSON dependency, runtime DLLs and notices in the planned dependency lock.
- [ ] Identify exact GGML Turbo, `base.en`, and supported Silero VAD revisions. Download only
  through explicit setup/development actions. Record exact sizes and independently compute
  SHA-256. Do not copy upstream SHA-1 labels into SHA-256 fields or commit weight files.
- [ ] Prove local CPU inference on a consented/public licensed sample using the pinned upstream
  CLI. Attempt CUDA using the same model and record the actual selected backend. This spike
  is a measurement aid; no voice UI or runtime dependency on an external CLI should be shipped.
- [ ] Produce a native helper build that can say hello, load a model and transcribe over private
  pipes. Check inherited environment contains no app/provider credentials. Exercise stop
  during loading and inference, parent exit and child crash.
- [ ] Stage the helper beneath an unpacked application directory and run it from a path with
  spaces/non-ASCII characters. Check dependent DLL resolution without developer PATH entries.
- [ ] Review the notices for weights, VAD, GGML and redistributed runtimes. Do not claim a
  specific CUDA minimum driver or redistributable set until the chosen build proves it.

Exit: versioned dependency/model manifests with real reviewed hashes, reproducible CPU build,
one successful real transcription, cancellation/exit evidence and an explicit CUDA result.
If warm native integration fails, record that evidence and revise the design before building
around a different transport. A CLI prototype alone does not complete the product feature.

Suggested commit: `build: pin Whisper artifacts and add native helper foundation`.

### W1. Implement supervised inference and model storage

- [ ] Implement the binary frame parser, strict control schemas and version handshake in both
  TypeScript and C++. Keep one model context and serialized inference; reset text context per
  utterance. Input reading remains responsive while loading/decoding.
- [ ] Add runtime prepare/transcribe/dispose with AbortSignal, forced-stop deadline, process
  exit observation, bounded output, clean environment and no shell launch.
- [ ] Implement the validated catalogue and cancellable, atomic model installation/removal.
  Download and hash in streams rather than loading gigabyte models into JavaScript memory.
- [ ] Implement versioned voice preferences using the repository's atomic-save pattern. Disabled
  is the default and also the recoverable fallback after malformed preferences.
- [ ] Inject filesystem/network/process/clock dependencies. Build the fake helper and downloader
  fixtures. Tests do not invoke real models, microphones, the network or a user's credentials.

Exit: offline boundary tests cover the runtime, model store and settings failure paths below.
No enabled UI controls before the backing path works. A no-GPU system has a CPU path.

Suggested commits: `feat: supervise local Whisper inference` and
`feat: manage verified speech models and preferences`.

### W2. Add capture lifecycle and the privileged boundary

- [ ] Implement shared voice schemas/constants, main controller and serialized coordination
  with Send, conversation transitions, model changes, disconnect and app shutdown.
- [ ] Add role-restricted named IPC/preload methods, snapshots and event subscriptions. Keep
  audio/text out of pet projections. Check sequence/session/cumulative limits before copying.
- [ ] Implement both Electron permission handlers for short-lived audio-only chat grants.
  Use installed Electron types and actual permission events, not only latest website examples.
- [ ] Add the local AudioWorklet, sample-rate conversion, downmix, chunk acknowledgments,
  backpressure, graph heartbeat, final flush and cleanup acknowledgment.
- [ ] Wire Finish separately from Cancel. Extend all existing Stop entry points: chat button,
  pet button, tray action and global shortcut. Cancel voice before hide/minimize/reload,
  lock/suspend, relevant modal/conversation transitions and quit.
- [ ] Close late-created MediaStreams after canceled permission requests. Escalate an
  unresponsive capture owner as specified; never leave the microphone live behind an idle UI.

Exit: synthetic capture can reach a fake recognizer and end safely across races, without any
live mic use. Packaged CSP/asset loading works for the worklet. Existing typed chat still works.

Suggested commits: `feat: add bounded microphone capture and voice IPC` and
`fix: coordinate voice cancellation with chat lifecycle`.

### W3. Connect the XP interface and draft flow

- [ ] Add Voice to Options, preserving staged Apply/OK/Cancel behavior. Expose model sizes,
  explicit download/cancel/remove, actual backend and actionable recoverable errors.
- [ ] Add Talk/Finish/Cancel and visible listening status to chat; route the pet's Talk action
  to chat. Keep cat dragging, glow, model controls, dimensions and reduced-motion behavior.
- [ ] Transfer text to the composer with session and draft revision guards. Preserve concurrent
  typing and pending review text when switching drafts. Never submit without normal Send.
- [ ] Handle no speech, too-short, denied/device-lost, model-missing, warm-up, out-of-memory,
  helper errors and oversized combined drafts with clear status, leaving typing usable.
- [ ] Disable only conflicting actions while voice is active; enforce the same rule in main.
  No new global voice hotkey is required for this milestone.
- [ ] Inspect real Electron windows at default/minimum size with keyboard navigation and a
  reduced-motion setting. Confirm the recording indicator is visible when pet controls hide.

Exit: click Talk, finish, edit and Send works in demo mode using fixture audio and a fake
recognizer; cancellation never creates a draft or agent turn. No real account usage in tests.

Suggested commit: `feat: add local dictation controls and transcript review`.

### W4. Package, evaluate and finish the feature

- [ ] Wire Windows native build/staging into packaging and release jobs, maintaining the
  repository's pinned action/dependency conventions. Keep helper resources outside ASAR.
- [ ] Add packaged native protocol smoke tests without real model downloads and UI smoke tests
  using synthetic capture. Smoke mode must not touch the host microphone or user model cache.
- [ ] Run the documented project verification commands. Fix regressions in ordinary chat,
  Codex fixtures, preferences/history, pet controls and shutdown.
- [ ] Perform the separate real-engine and microphone evaluation below with a user-controlled
  test session. Record exact engine/model/backend and measured latency; do not infer a result
  from a GPU model name or generic benchmark.
- [ ] Check an unpacked build and installer on clean Windows x64 without developer tools;
  verify CPU, model download cancellation/retry, offline reuse, upgrade and uninstall behavior.
- [ ] Update README setup/use, architecture, current state, XP guide, third-party notices,
  decisions and supported-platform limitations to match shipped behavior. Resolve/remove the
  task handoff only after useful remaining findings have moved into durable docs.

Exit: all completion criteria below are demonstrated. Mark GPU optimization or quantization
unsupported if unverified; do not silently claim those paths were tested.

Suggested commits: `build: package Whisper helper and native dependencies`,
`test: cover packaged voice input and recovery`, and `docs: document local voice setup`.

## Boundary verification matrix

These are behavioral tests to implement with the feature, not tests of this documentation.

| Boundary | Required cases | Expected outcome |
| --- | --- | --- |
| Permission policy | Chat audio during valid grant; pet/subframe/wrong URL/null contents; video/mixed request; request without grant | Only intended audio grant succeeds; others remain denied |
| Browser capture | Permission denied, missing/busy/unplugged mic; start canceled while permission awaits; worklet failure; renderer unmount | Tracks/nodes close, result discarded, useful error, no automatic retry |
| Resampling | 44.1/48/96 kHz signals, stereo downmix, clipping, split-chunk continuity, tail flush | Correct 16 kHz length/rate, no NaN, no discontinuity, anti-alias behavior verified |
| IPC | Wrong sender, bad UUID, replay, duplicate/out-of-order chunks, odd/oversized bytes, fake duration, overrun | Reject before accumulating/inference; bounded buffers; newer session unaffected |
| Session races | Double Talk, Finish/Cancel race, late result, new chat/model/disconnect during load, Send during record | One owner/job; no old transcript in new chat; no automatic agent call |
| Draft ownership | Existing draft, typing during decode, repeated result event, switch/reload before/after acknowledgment | No replacement/loss of typed text; at-most-once insertion; documented recovery |
| Helper protocol | Partial/combined/truncated frames, excessive lengths, invalid JSON/UTF-8, stdout noise, mismatched version/ID | Bounded parser fails closed, helper recycled, typing stays usable |
| Native lifecycle | Crash, invalid/missing model, GPU initialization failure, hang, stdin EOF, parent death, repeated cancel | Actual backend reported; deadline enforced; no orphaned helper |
| Model storage | Wrong checksum/size, unsafe redirect, interrupted request, disk-full, stale partial, delete/load race, junction | No corrupt ready state or out-of-root write/delete; good asset preserved |
| Preferences | Missing/corrupt file, invalid language/model pair, save failure, staged Cancel | Disabled fallback or prior saved/live settings preserved; no mic on enable |
| Retention | Finish, Cancel, no-speech, failure, quit; inspect test user-data files and captured logs | No recorded audio/transcript before Send; sent text follows existing chat retention |
| App lifecycle | Stop from every entry point, hide/minimize, modal, lock/suspend, resume, quit | Capture/job canceled; resume does not reopen microphone; shutdown bounded |
| Packaging | Spaces/Unicode path, no developer PATH, no CUDA/toolkit, missing DLL, production CSP | Clear unsupported/error behavior; CPU works; no shell/HTTP/developer dependency |

Native framing and lifecycle tests should run without model weights, using an injected fake
inference function; a fake Node helper alone cannot validate C++ parsing or parent-loss logic.
Keep a distinct real-engine integration check with licensed audio and pre-provisioned weights.
It is a deliberate local/release evaluation, not a default CI download or paid model call.

## Repeatable real-engine evaluation

Use an explicit local evaluation session to record the following synthetic phrases; do not
commit private microphone recordings. For portable fixtures, document the source and license
or generate them through a confirmed offline voice with suitable redistribution rights.
Run transcription only: references to deletion or sending are linguistic tests, never actions.

| Case | Spoken input or condition | What to check |
| --- | --- | --- |
| Ordinary question | "What does this error mean?" | Full short question |
| Negation | "Do not delete the folder." | Negation survives exactly |
| Correction | "Open Settings. Actually, cancel that." | Correction is retained, not rewritten away |
| Numbers | "Set the value to fifteen, not fifty." | Both numbers and their relation |
| Decimal/sign | "Use minus three point five." | Correct sign/value |
| Identifier | "Open report underscore final dot C S V." | Report real spelling behavior; do not assume spoken punctuation becomes a path |
| Product names | "Ask Computer Cat about Electron and TypeScript." | Product/technical terms |
| Very short | "Stop." | Short speech isn't erased by VAD |
| Quiet speech | A short question spoken softly | VAD recall and transcription |
| Pauses | A sentence with a two-second middle pause | Recording continues until Finish |
| Silence | Five seconds of quiet | No invented text or model submission |
| Non-speech | Keyboard/fan/speaker noise without speech | No fabricated command; note false positives |
| Mixed noise | Same question with ordinary room noise | Compare fidelity with quiet recording |
| Longer input | 30 seconds with several clauses | Complete ordering, no duplicates/dropped boundaries |
| Limit | 120-second synthetic/consented recording | Bounded finish/flush, no hidden continued capture |
| Cancel | Cancel during record and during inference | No transcript delivery and bounded cleanup |
| Language | A known non-English sentence with Turbo Auto | Correct transcription language, no translation |
| Reuse | Several separate utterances with repeated proper names | No previous-turn transcription leakage |

Use at least 20 positive utterances and 10 no-speech/noise trials; include multiple repetitions
and short/long cases. Hold microphone, sample corpus, decoder settings and power mode constant
when comparing Turbo CPU, Turbo CUDA, `base.en`, or optional quantization. English-only models
must not be penalized on unsupported-language cases or advertised as multilingual.

Measure cold-load time separately from warm finish-to-transcript p50/p95, plus peak process
memory, observed VRAM when available, recorded duration, actual backend, and cancellation time.
Record both raw and punctuation/case-normalized word error rate; separately inspect critical
negations, numbers and names. WER alone cannot establish command safety or user satisfaction.

Initial product targets, to validate rather than promise:

- Warm Turbo CUDA: p50 at most two seconds and p95 at most four seconds from Finish to usable
  draft for 5-15 second utterances on the measured target system. Report raw cases and failures.
- CPU fallback: functional correctness and usable UI are mandatory; publish measured latency
  and offer the smaller model when Turbo is too slow. Do not set a GPU-speed promise for CPUs.
- Stop: zero transcript insertions after cancellation; native work ends within the two-second
  bound. Microphone graph stops promptly, with escalation checked if the renderer is hung.
- Zero invented transcripts on the fixed no-speech acceptance set; no missing critical negation
  in the fixed command set. A finite pass is a regression gate, not a universal accuracy claim.

Keep private recordings and machine-specific raw reports in ignored local scratch. Commit only
aggregate, non-personal results, exact artifact IDs, methodology and known limitations to a
dated evaluation note. Do not collect a live microphone sample without a deliberate user action.

## Verification commands and release completion

Current commands already present in [package.json](../../../package.json):

```sh
npm run memory:check
npm run verify
npm run test:smoke
npm run package:dir
```

When exercising the packaged build on Windows, set `COMPUTERCAT_PACKAGED_EXECUTABLE` to the
actual unpacked executable and run `npx playwright test`, matching the existing CI pattern.
Only document new native-build/evaluation npm commands after adding them to package.json.
Preparation-only Markdown changes need memory/link and diff checks; they do not establish
any native build, microphone, application, accuracy or GPU result.

The feature is complete when a fresh Windows user can install Computer Cat, explicitly install
a verified model, record and review text offline, Send through the existing selected connection,
and recover from every supported cancellation/error path without a live microphone or orphaned
helper. Real-engine, permission, packaged-CSP and clean-machine tests must supplement mocks.
Keep later speech output and screen/control work out of this completion claim.
