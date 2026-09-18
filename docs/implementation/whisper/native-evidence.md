# Native speech implementation evidence

Reviewed: 2026-09-18. This is development evidence, not release qualification.

The [source lock](../../../native/whisper-helper/dependencies.lock.json) pins whisper.cpp
1.9.4 at 927cfce34f31707e17f2bff35c349632fb9e2c3a and nlohmann/json 3.12.0. The
[model catalogue](../../../resources/voice/models.json) contains independently downloaded,
SHA-256-verified Turbo, base.en and Silero 6.2.0 artifacts. See the
[notices](../../../resources/voice/THIRD_PARTY_NOTICES.md).

The helper builds with MSVC 19.51.36248.0, CMake 4.3.1 and Windows SDK 10.0.26100.0.
It links the C++ runtime statically; dumpbin reports only KERNEL32.dll and ADVAPI32.dll.
Its wide-path model loader avoids the upstream narrow fopen limitation for Windows usernames.
The [native checks](../../../native/whisper-helper/tests/check.mjs) exercise framing, malformed
input, missing models and stdin EOF without model downloads. Optional pre-provisioned models
exercise real load, transcription, silence and cancellation. Tests never open a microphone.

The public JFK inaugural-address excerpt included in the pinned upstream source is used only
in ignored development scratch. The speech is a US federal government work; no private audio
was collected. An eleven-second excerpt retained the phrase "ask not" in both models.
Upstream CLI (AVX2, six threads) measured base.en total 1.57 seconds and Turbo total 20.51
seconds, including loads of 0.27 and 2.61 seconds. The portable helper (no AVX2) measured
base.en load 0.11 seconds and inference 14.13 seconds. These are single local trials, not
p50/p95 results or accuracy qualification. Portable Turbo exceeded the 120-second deadline.
The guarded AVX2 helper measured base.en load 0.10 seconds/inference 1.16 seconds and Turbo
load 0.59 seconds/inference 17.17 seconds on the same excerpt. The executables and model
paths included spaces and non-ASCII characters, with only Windows System32 on PATH.
Both helper builds depend only on KERNEL32.dll and ADVAPI32.dll.

CUDA is not distributed: CMake configuration with GGML_CUDA=ON explicitly failed with
CUDA Toolkit not found. The installed GPU/driver alone cannot supply a build toolchain.
Auto currently chooses CPU; explicit CUDA returns backend-unavailable. A GPU name is not
proof of a working native backend. CPU inference, real model verification and offline
runtime/store boundary tests are established; full W0-W4 acceptance remains in progress.

The real model-store client was also tested with base.en: cancel after partial download,
retry, complete SHA-256 verification and reuse with the network client disabled all passed.
The immutable Hugging Face URL redirected to us.aws.cdn.hf.co; this exact host is now in
the reviewed allowlist. Unreviewed redirect hosts are still rejected before contact.

Packaged desktop verification passed all 12 tests, including synthetic microphone capture,
camera denial, pet sender restrictions, transcript/draft review, tracks ending on minimize,
minimum-size options, and existing Codex/history/pet workflows. Native injected-inference
tests exercise cancellation during load/decoding and EOF during uncooperative loading.
The test engine is a separate executable excluded from the installer. No live microphone
was opened. These checks do not establish a clean-machine install or corpus-level accuracy.
