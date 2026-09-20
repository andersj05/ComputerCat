# Current project state

Reviewed: 2026-09-19. Recheck checkout and tests.

## What exists

Computer Cat uses Electron/React/TypeScript and Pi. Versions are pinned in
[package.json](../../package.json) and [.node-version](../../.node-version).

- The draggable cat has eleven [activity poses](../cat-motion.md), with reduced-motion stills.
- Replies render safe Markdown; see [renderer](../../src/renderer/src/MarkdownMessage.tsx).
- Seven [desktop tools](../desktop-context.md) observe apps, windows, screenshots and regions,
  accessible text, tabs and selection on demand. Capture targets one source; app coverage varies.
- Default demo mode produces deterministic local replies without credentials or API calls.
  Models & sign-in supports app-owned Codex login; chat and cat expose direct model selection.
  History resumes/deletes saved conversations. Options → Models stores new-chat defaults.
- Options stages pet/voice/model defaults; Apply/OK saves, Cancel discards unapplied changes.
- Options → [Harness guide](../harness-guide.md) opens an offline browser map, examples,
  typed tool catalog and extension guidance.
- Local Whisper uses explicit downloads, background preparation and Talk/Finish/Cancel.
  Enabled models stay ready by default; Voice performance offers an idle-unload option.
  The cat's panel supports typing, voice, New chat, History, tool steps, expandable replies and Copy.
  Talk/Chat stay visible; drafts follow conversations in both windows.
  Portable/AVX2 CPU helpers are supported; CUDA is not. Audio is not saved.
  See the [release-check handoff](handoffs/2026-09-17-local-whisper.md).
- [Developer memory](README.md) is shared across coding clients and checked by `npm run memory:check`.

[Codex smoke tests](../../tests/smoke/codex.spec.ts) use offline OAuth/model fixtures.

## Persistence boundaries

| Data | Actual behavior | Evidence |
| --- | --- | --- |
| Shared developer knowledge | Markdown versioned in Git; agents update it deliberately | [Memory guide](README.md), [decisions](decisions.md) |
| Pet preferences | Validated atomic writes to preferences.json in Electron user data | [Store](../../src/main/preferences.ts), [tests](../../tests/unit/preferences.test.ts) |
| Visible chat | Local versioned transcripts; new chats preserve history; resume/delete by UUID | [Store](../../src/main/conversation-store.ts), [tests](../../tests/unit/conversation-controller.test.ts) |
| Pi conversation context | Native per-chat Pi JSONL restores tool results; model changes retain context | [Pi adapter](../../src/agent/pi-runtime.ts), [runtime prompt](../../src/agent/runtime.ts) |
| Model defaults | Atomic models.json defaults; direct model changes persist per chat | [Model controller](../../src/main/model-controller.ts), [tests](../../tests/unit/model-controller.test.ts) |
| Credentials | Codex tokens encrypted by OS safeStorage; main refreshes before each turn and sends only access tokens to the worker | [OAuth](../../src/agent/codex-auth.ts), [vault](../../src/main/secret-store.ts), [tests](../../tests/unit/codex-auth.test.ts) |

Pi discovers no agent files, extensions, skills or prompts. Its eight built-in file/search/shell
 tools run with OS user permissions from Desktop and report tool activity. The worker is not
an OS sandbox. Developer memory is never loaded into the in-app agent. See
[architecture](../architecture.md) and [Pi tests](../../tests/unit/pi-runtime.test.ts).

## Find the implementation

| Work | Start here | Behavioral checks |
| --- | --- | --- |
| Windows, IPC sender checks, tray, shortcuts | [Main](../../src/main/index.ts), [preload](../../src/preload/index.ts) | [Desktop smoke](../../tests/smoke/desktop.spec.ts) |
| Message validation, streaming, cancellation, reset | [Controller](../../src/main/chat-controller.ts), [schemas](../../src/shared/validation.ts) | [Controller tests](../../tests/unit/chat-controller.test.ts) |
| Worker lifecycle and late events | [Worker runtime](../../src/main/worker-runtime.ts), [protocol](../../src/agent/protocol.ts) | [Worker tests](../../tests/unit/worker-runtime.test.ts) |
| Model setup and resource isolation | [Pi adapter](../../src/agent/pi-runtime.ts), [configuration](../../src/agent/config.ts) | [Pi tests](../../tests/unit/pi-runtime.test.ts) |
| Codex sign-in, refresh, and model selection | [OAuth](../../src/agent/codex-auth.ts), [model controller](../../src/main/model-controller.ts) | [OAuth tests](../../tests/unit/codex-auth.test.ts), [model tests](../../tests/unit/model-controller.test.ts) |
| Chat, dialogs, cat, visual tokens | [App](../../src/renderer/src/App.tsx), [Options](../../src/renderer/src/OptionsDialog.tsx), [Pet](../../src/renderer/src/Pet.tsx), [tokens](../../src/renderer/src/tokens.css) | [XP design](../windows-xp-design.md), [desktop smoke](../../tests/smoke/desktop.spec.ts) |
| Local voice, permissions, downloads, native supervision | [Controller](../../src/main/voice/controller.ts), [capture](../../src/renderer/src/voice/capture.ts), [native evidence](../implementation/whisper/native-evidence.md) | [Voice smoke](../../tests/smoke/voice.spec.ts), [native checks](../../native/whisper-helper/tests/check.mjs) |
| Builds and release artifacts | [Build](../../electron.vite.config.ts), [packaging](../../electron-builder.yml), [CI](../../.github/workflows/ci.yml) | [Release workflow](../../.github/workflows/release.yml) |

## Not implemented

Computer control, external MCP, selected-fact user memory, speech output, other-provider
credential settings, signing and app updates remain future work. The
[research plan](../research-and-build-plan.md) proposes these; it is not a completion checklist.

See [handoffs](handoffs/README.md) for unfinished work.
