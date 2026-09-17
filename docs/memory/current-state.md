# Current project state

Reviewed: 2026-09-17. Application baseline: `f977044` (XP companion merged into `dev`).
This is a capability map, not a live branch, issue tracker, or record of today's test results.
Check Git and the relevant code when resuming; update this snapshot when capabilities change.

## What exists

Computer Cat is a Windows-first Electron/React/TypeScript desktop companion using a pinned Pi
SDK behind an application-owned runtime interface. Use the Node version in
[.node-version](../../.node-version) and exact dependencies in [package.json](../../package.json).

- The transparent pixel cat opens a compact XP messenger. Tray actions and global shortcuts
  show chat and stop replies. Closing chat hides it; quitting ends the application.
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
the tool allowlist is empty. Developer memory must not be loaded into the desktop agent.
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

Future user memory needs an explicit product/storage design: distinguish preferences, retained
conversations, and selected facts; provide inspection/deletion and retention controls; isolate
users/sessions; define migrations and corruption recovery; and test context selection and reset.
Simply replacing Pi's in-memory session manager would not deliver those behaviors.

Active work and priorities come from the user's task, Git, and the relevant
[handoff](handoffs/README.md). This snapshot does not assign a next feature or reserve files.
