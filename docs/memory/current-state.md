# Current project state

Reviewed: 2026-09-20. Recheck checkout and tests.

## What exists

Computer Cat uses Electron/React/TypeScript and Pi. Versions are pinned in
[package.json](../../package.json) and [.node-version](../../.node-version).

- The draggable cat has eleven [activity poses](../cat-motion.md), with reduced-motion stills.
- Replies render safe Markdown; see [renderer](../../src/renderer/src/MarkdownMessage.tsx).
- Ten [desktop tools](../desktop-context.md) read windows, selections, tabs, document URLs,
  controls and matching text, or capture a source/region on demand. App coverage varies.
- Six [desktop utilities](../harness-improvements.md) get time/folder paths, read/write requested
  clipboard text, open links/folders and reveal files. Launch results confirm dispatch, not UI success.
- Four [web tools](../web-research.md) read, page and find public static text, plus optional Brave
  search using a separate main-process key. Page references expire after five minutes or turn end.
- Demo replies are deterministic and offline. App-owned Codex login and direct model selection
  work in chat/cat; History resumes/deletes chats. Options → Models sets new-chat defaults.
- Options stages pet/voice/model defaults; Apply/OK saves, Cancel discards unapplied changes.
- Options → [Harness guide](../harness-guide.md) opens an offline browser map, examples,
  typed tool catalog and extension guidance.
- Local Whisper uses explicit downloads, background preparation and Talk/Finish/Cancel.
  Enabled models stay ready unless idle unload is selected. CPU portable/AVX2 only; no saved audio.
  Cat panel size/drafts persist during this run; New chat stays visible and secondary actions use ⋯.
  See the [release checks](handoffs/2026-09-17-local-whisper.md) and [XP guidance](../windows-xp-design.md).

## Persistence boundaries

| Data | Actual behavior | Evidence |
| --- | --- | --- |
| Shared developer knowledge | Markdown versioned in Git; agents update it deliberately | [Memory guide](README.md), [decisions](decisions.md) |
| Pet preferences | Validated atomic writes to preferences.json in Electron user data | [Store](../../src/main/preferences.ts), [tests](../../tests/unit/preferences.test.ts) |
| Visible chat | Local versioned transcripts; new chats preserve history; resume/delete by UUID | [Store](../../src/main/conversation-store.ts), [tests](../../tests/unit/conversation-controller.test.ts) |
| Pi conversation context | Native per-chat Pi JSONL restores tool results; model changes retain context | [Pi adapter](../../src/agent/pi-runtime.ts), [runtime prompt](../../src/agent/runtime.ts) |
| Model defaults | Atomic models.json defaults; direct model changes persist per chat | [Model controller](../../src/main/model-controller.ts), [tests](../../tests/unit/model-controller.test.ts) |
| Credentials | Codex tokens encrypted by OS safeStorage; main refreshes before each turn and sends only access tokens to the worker | [OAuth](../../src/agent/codex-auth.ts), [vault](../../src/main/secret-store.ts), [tests](../../tests/unit/codex-auth.test.ts) |

Pi discovers no agent files, extensions, skills or prompts, including developer memory.
Its eight file/search/shell tools run from Desktop with OS user permissions and report activity.
The worker is not an OS sandbox; see [architecture](../architecture.md).

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

Mouse/keyboard control, full browser integration, external MCP, selected-fact user memory, speech output, other-provider
credential settings, signing and app updates remain future work. The
[research plan](../research-and-build-plan.md) proposes these; it is not a completion checklist.

See [handoffs](handoffs/README.md) for unfinished work.
