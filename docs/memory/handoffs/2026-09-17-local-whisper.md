# Handoff: local Whisper release qualification

Status: Windows CPU implementation and automated integration complete; release qualification remains
Updated: 2026-09-18
Branch: `feat/local-whisper-input`
Base: current `origin/dev` at `2acff1b`; preparation commits through `494f8b7` integrated explicitly
Implementation commits: `b36a684` through `bd7f0c8`, followed by the final verification note

## Implemented

The requested local-input flow is implemented: disabled-by-default Voice settings, explicit
verified Turbo/base.en/Silero downloads, chat-owned AudioWorklet capture, persistent native
Whisper helper, Finish/Cancel, editable composer delivery and concurrent-draft review. All
existing Stop paths reach voice cleanup. The renderer has no filesystem/native-process access;
pet snapshots contain no transcripts or settings. No speech API, live account call, or microphone
recording was used in development tests. Audio and unsent text are memory-only.

The native lock/catalogue contain real full source revisions, sizes and independently verified
SHA-256 hashes. CPU and guarded AVX2 executables link only Windows system DLLs. Auto selects
CPU, using AVX2 when CPUID/OS support allows it. CUDA configuration failed because no toolkit
is installed; CUDA is not packaged or advertised as available. Do not infer GPU support from
the installed GPU. The portable Turbo trial exceeded the two-minute deadline; Base English
is available as an explicit smaller choice. See [native evidence](../../implementation/whisper/native-evidence.md).

## Code and verification

- [Main controller](../../../src/main/voice/controller.ts), [permissions](../../../src/main/voice/permissions.ts),
  [model store](../../../src/main/voice/model-store.ts), [supervisor](../../../src/main/voice/whisper-runtime.ts).
- [Capture](../../../src/renderer/src/voice/capture.ts), [resampler](../../../src/renderer/src/voice/resampler.ts),
  [draft ownership](../../../src/renderer/src/voice/useVoice.ts), Voice controls and Options tab.
- [Native helper](../../../native/whisper-helper/src/main.cpp), [build script](../../../scripts/build-whisper-helper.ps1),
  package resource configuration, and Windows CI/release build steps.
- Offline tests exercise framing, runtime failure/cancel, storage/settings, controller races,
  permissions, resampling and delayed microphone cleanup. Synthetic Electron tests exercise
  editable transcript delivery, typing during capture, cancellation, camera denial, pet roles,
  track release on minimize, and minimum-size Voice options.
- Full packaged desktop suite: 12 passed, including existing Codex/history/preferences tests.
  The earlier desktop test's three-tab assumption was updated to include Voice.
- Native protocol and injected-inference cancellation/EOF tests pass without models. Real CPU
  base.en/Turbo sample transcription, silence rejection and cancellation pass with AVX2.
  Base English also passes with the portable helper. Unicode/space executable and model paths
  were exercised with a minimal PATH. Real model installation cancellation/retry and offline
  reuse passed after adding the observed, exact `us.aws.cdn.hf.co` redirect host.

Check Git status and the final verification summary before resuming; do not treat this record
as proof that subsequent changes pass. Build outputs and models are ignored, never committed.
No PR, remote push, merge, release publication, user microphone grant or global configuration
change is implied by this handoff.

## Final verification recorded 2026-09-18

- npm run verify: passed; memory, lint, TypeScript, 91 tests across 19 files, production build.
- npm run test:smoke: passed all 12 source-build desktop tests.
- npm run voice:build and npm run voice:test-native: passed for portable/AVX2 CPU helpers
  and the separate injected-inference test target. Malformed frames must terminate the helper
  without closing its stdin; oversized sample counts are checked before multiplication.
- npm run package:dir: passed. All 12 desktop tests passed against the unpacked application;
  both voice tests were rerun after the final application fixes, including Talk from the pet.
  The final native-only parser fix was rebuilt, copied into the unpacked resources and checked
  there with malformed frames and real base.en transcription, silence and cancellation.
- Real Turbo runtime cancellation: a load aborted at 100 ms had finished cleanup by 874 ms
  from start; active inference stopped in 109 ms after abort. These are single local trials.
- No live microphone, paid model API, clean-machine installer or CUDA inference was tested.

## Remaining release gates and next action

1. Run the explicit user-controlled microphone evaluation in the
   [delivery checklist](../../implementation/whisper/delivery.md): at least 20 positive phrases
   and 10 silence/noise trials, negations/numbers, quiet/short speech, language, pauses and limits.
   Record raw/normalized WER and cold/warm p50/p95 with actual backend and model. The public
   eleven-second sample is a functional check, not that accuracy study.
2. Test the installer, model install/cancel/retry, offline reuse, upgrade and uninstall on clean
   Windows x64 without development tools. Also test portable CPU fallback on non-AVX2 hardware
   and renderer-hang cleanup against the actual Windows microphone indicator.
3. If GPU work is pursued, build from the existing pin with an explicitly provisioned toolkit,
   inventory redistributable licenses/DLLs and compatible drivers, and test initialization failure
   and CPU fallback before exposing CUDA in Options. Keep unsupported status until then.
4. Add remaining stress cases from the contract matrix as warranted (long recordings, hostile
   filesystem races, multi-device unplug/replug, suspend during native load, real no-speech set).

The implementation can be reviewed now. The complete release-acceptance checklist must not be
marked passed from mocks alone. Remove this handoff after these remaining gates are resolved
and durable results are incorporated into maintained documentation.
