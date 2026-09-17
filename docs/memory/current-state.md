# Current project state

Reviewed: 2026-09-17, including desktop cat interaction and presence.
Check Git and relevant code when resuming; this map does not establish checkout or test results.

## What exists

Computer Cat is a Windows-first Electron/React/TypeScript desktop companion using a pinned Pi
SDK behind an application-owned runtime interface. Use the Node version in
[.node-version](../../.node-version) and exact dependencies in [package.json](../../package.json).

- The transparent cat supports click-to-chat, body/grip dragging, Chat/Options/Stop controls,
  blinking, and separate idle/thinking motion. Tray actions and shortcuts show chat and stop replies.
- Always on top recovers z-order without focus; Find cat brings it to the pointer’s display.
- Default demo mode produces deterministic local replies without credentials or API calls.
  Options → Models supports application-owned Codex subscription login, saved model/reasoning
  defaults, and a separate explicitly configured environment API-key connection.
- Options stages pet size, animation, and always-on-top changes. Apply/OK persists them;
  Cancel/Escape discards unapplied changes. Saving failures preserve the previous live settings.
- Project development memory lives in [this directory](README.md). Its entry points are shared
  across supported coding clients and checked by `npm run memory:check`.

User-facing behavior is documented in [README](../../README.md) and
[XP design](../windows-xp-design.md). Verify desktop behavior with
[Electron smoke tests](../../tests/smoke/desktop.spec.ts).
[Codex smoke tests](../../tests/smoke/codex.spec.ts) intercept OAuth and model traffic; they
consume no subscription usage and cannot establish live account entitlement.

## Persistence boundaries

| Data | Actual behavior | Evidence |
| --- | --- | --- |
| Shared developer knowledge | Markdown versioned in Git; agents update it deliberately | [Memory guide](README.md), [decisions](decisions.md) |
| Pet preferences | Validated atomic writes to preferences.json in Electron user data | [Store](../../src/main/preferences.ts), [tests](../../tests/unit/preferences.test.ts) |
| Visible chat | In-memory controller; New conversation clears it and replaces its runtime | [Controller](../../src/main/chat-controller.ts), [tests](../../tests/unit/chat-controller.test.ts) |
| Pi conversation context | In-memory session for the runtime; no disk session restoration | [Pi adapter](../../src/agent/pi-runtime.ts), [runtime prompt](../../src/agent/runtime.ts) |
| Model defaults | Validated atomic writes to models.json; active chats keep their selection until reset | [Model controller](../../src/main/model-controller.ts), [tests](../../tests/unit/model-controller.test.ts) |
| Credentials | Codex tokens encrypted by OS safeStorage; main refreshes before each turn and sends only access tokens to the worker | [OAuth](../../src/agent/codex-auth.ts), [vault](../../src/main/secret-store.ts), [tests](../../tests/unit/codex-auth.test.ts) |

The Pi resource loader returns no discovered agent files, extensions, skills, or prompts;
all eight built-in Pi tools are enabled (read, write, edit, ls, find, grep, Bash, PowerShell).
The worker starts in the OS Desktop folder and reports tool activity in chat. Local tools run
with the user’s OS permissions, as explicitly requested; the worker is not an OS sandbox. Developer memory must not be loaded into the desktop agent.
See [architecture](../architecture.md) and [Pi isolation tests](../../tests/unit/pi-runtime.test.ts).

## Find the implementation

| Work | Start here | Behavioral checks |
| --- | --- | --- |
| Windows, IPC sender checks, tray, shortcuts | [Main](../../src/main/index.ts), [preload](../../src/preload/index.ts) | [Desktop smoke](../../tests/smoke/desktop.spec.ts) |
| Message validation, streaming, cancellation, reset | [Controller](../../src/main/chat-controller.ts), [schemas](../../src/shared/validation.ts) | [Controller tests](../../tests/unit/chat-controller.test.ts) |
| Worker lifecycle and late events | [Worker runtime](../../src/main/worker-runtime.ts), [protocol](../../src/agent/protocol.ts) | [Worker tests](../../tests/unit/worker-runtime.test.ts) |
| Model setup and resource isolation | [Pi adapter](../../src/agent/pi-runtime.ts), [configuration](../../src/agent/config.ts) | [Pi tests](../../tests/unit/pi-runtime.test.ts) |
| Codex sign-in, refresh, and model selection | [OAuth](../../src/agent/codex-auth.ts), [model controller](../../src/main/model-controller.ts) | [OAuth tests](../../tests/unit/codex-auth.test.ts), [model tests](../../tests/unit/model-controller.test.ts) |
| Chat, dialogs, cat, visual tokens | [App](../../src/renderer/src/App.tsx), [Options](../../src/renderer/src/OptionsDialog.tsx), [Pet](../../src/renderer/src/Pet.tsx), [tokens](../../src/renderer/src/tokens.css) | [XP design](../windows-xp-design.md), [desktop smoke](../../tests/smoke/desktop.spec.ts) |
| Builds and release artifacts | [Build](../../electron.vite.config.ts), [packaging](../../electron-builder.yml), [CI](../../.github/workflows/ci.yml) | [Release workflow](../../.github/workflows/release.yml) |

## Not implemented

Screen capture, computer control, external MCP connections, user long-term memory, conversation
restoration, voice, credential settings for other providers, code signing, and automatic app updates remain
future work. The [research plan](../research-and-build-plan.md) discusses these; it is not a
completion checklist. A worker process isolates crashes but is not an OS security sandbox.

Future user memory needs a storage design with inspection/deletion, retention, migrations,
corruption recovery, and tests for context selection. Conversation history is a separate feature.

Find unfinished work in the relevant [handoff](handoffs/README.md) and Git.
