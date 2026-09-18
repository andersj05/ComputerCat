# Local speech third-party notices

Reviewed: 2026-09-18. The exact source archives and downloaded model bytes are pinned in
[the native lock](../../native/whisper-helper/dependencies.lock.json) and
[the catalogue](models.json). All three model SHA-256 values were independently computed
from complete downloads and matched Hugging Face LFS metadata. Weights are not in Git or
the installer. CUDA libraries are not distributed.

- whisper.cpp 1.9.4 and its bundled GGML: [MIT notice](licenses/whisper-ggml.txt).
- nlohmann/json 3.12.0: [MIT notice](licenses/nlohmann-json.txt).
- OpenAI Whisper model weights: [MIT notice](licenses/whisper-models.txt).

The helper links the MSVC runtime statically; it needs no separately copied VC runtime DLLs.
The native build and dependency inspection must be repeated when changing compiler or flags.

- Silero VAD 6.2.0 weights: [MIT notice](licenses/silero.txt), upstream notice revision 60b7ffa243625ebdc1070275a29f18c87843786a.
