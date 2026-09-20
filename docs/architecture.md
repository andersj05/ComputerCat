# Architecture

The initial application is a desktop companion and a controlled Pi SDK integration. It has
a local demo mode that works without credentials. The agent selects on-demand screen tools
for relevant user requests. Mouse/keyboard control, external MCP servers and selected-fact user memory
remain later features.

Developer context is maintained separately in [shared project memory](memory/README.md), entered
through root [AGENTS.md](../AGENTS.md). It is not loaded by the app's Pi resource loader and does
not supply the app’s conversation history. Keep these two forms of memory separate when adding features.

Local speech input (reviewed 2026-09-18) follows the
[Whisper design](implementation/whisper/README.md). The trusted main frame that starts Talk (chat or cat) owns an
AudioWorklet and microphone grant. A [main controller](../src/main/voice/controller.ts)
serializes sessions against Send/history/model changes, validates PCM and releases capture
before final inference. Both Electron permission handlers require the exact initiating window URL, main frame,
audio-only request and active grant. Capture IPC also verifies the initiating window.
A missing cleanup acknowledgment crashes/reloads the
capture renderer after two seconds; this can lose unsent drafts, like an ordinary renderer crash.

The [supervisor](../src/main/voice/whisper-runtime.ts) starts a persistent native helper over
private pipes with an allowlisted environment. Portable and guarded AVX2 CPU builds share
whisper.cpp 1.9.4; no CUDA backend is distributed. The helper resets linguistic context,
performs Silero VAD and returns bounded text. During recording the controller runs at most one
provisional pass at a time, after four seconds of new audio. Finish waits for that pass before
final recognition; cancellation suppresses both results. It has no microphone, credentials or network
service. stdin EOF triggers cooperative abort and a hard exit deadline. Main also enforces
load/inference timeouts and waits for exit before replacement. Enabled, installed models preload
at startup and after voice settings are applied without opening a microphone. Enabled models stay loaded by default; the optional memory-saving setting unloads them after five
idle minutes. Chat/Options transitions preserve preload and cancelling capture without inference
retains the model. Lock/sleep releases it; preparation resumes only after both blocks clear.
Reviewed 2026-09-19 against [voice boundary tests](../tests/unit/voice-controller.test.ts).

[Model storage](../src/main/voice/model-store.ts) streams explicit, bounded HTTPS downloads,
checks fixed catalogue lengths and SHA-256, then renames a same-volume partial. Installed
files are verified once per run. Symlinks/junction ancestors are rejected. Voice preferences
live in voice.json, disabled by default. Audio is memory-only; main retains a transcript until
React commits composer/review ownership. Pet snapshots exclude settings, downloads and chat-origin text.
Voice sends reviewed text through the existing agent interface; Codex authentication is unchanged. See
[native evidence](implementation/whisper/native-evidence.md) for verified behavior and remaining
real-microphone/clean-machine gates.

```text
Sandboxed React renderer
  -> typed, allowlisted preload API
    -> validated Electron main-process controller
      -> local runtime (demo) or isolated agent worker (Pi)
        -> configured model provider
```

| Directory | Responsibility |
| --- | --- |
| `src/shared` | Serializable types and request validation |
| `src/agent` | Runtime contract, deterministic demo, Pi adapter, worker protocol |
| `src/main` | Windows, lifecycle, validated IPC, worker management |
| `src/preload` | Narrow contextBridge API |
| `src/renderer` | Companion and chat UI; no Node or provider access |
| `assets` | Original supplied artwork and packaging assets |
| `tests` | Behavioral unit tests and Electron smoke tests |

The renderer is sandboxed with context isolation and no Node integration. It can request
only named application operations. Main validates both sender identity and arguments. Remote
navigation and new windows are denied. Browser permissions are denied except the narrow
session-owner microphone grant described above. Model output is rendered as Markdown through React elements, with raw HTML skipped,
images reduced to alt text, and links displayed without navigation. The app never imports extensions or instructions discovered in arbitrary folders.

The Pi worker owns a session for the current conversation. Its resource loader is explicitly empty,
its explicit allowlist contains all eight built-in Pi tools plus seven app-owned desktop
observation tools, and native Pi sessions are saved per conversation.
The worker starts in the OS Desktop folder. Tools use the current user’s filesystem/shell
permissions; validated tool activity events cross the worker port without raw tool output. Main resolves the selected connection
before each turn and sends validated configuration over the private worker port. The worker's
environment contains no provider credentials. Changing a conversation’s model creates a fresh worker that restores the same native Pi
context, including tool results. The access token rotates between turns without a new worker.
The worker registers a Codex request-auth adapter that accepts only the main-resolved access
token. The SDK's unmodified Codex provider is OAuth-only and cannot consume its generic runtime
API-key override. Main retains the original OAuth provider; the worker has no login/refresh
handler. Codex replies stream over SSE without a background WebSocket connection cache.

The app owns its Codex login through the pinned Pi provider's OAuth flow. The adapter in
`src/agent/codex-auth.ts` runs in the privileged host, with encrypted persistence supplied by main.
Browser sign-in uses the SDK's PKCE/local callback; the manual fallback requires the complete
callback URL and matching state. Device-code sign-in is also supported. Only exact OpenAI auth
destinations can be opened; renderer requests never supply an arbitrary browser URL. Sign-in
attempts are cancellable, expire after fifteen minutes, and reject stale callbacks.

Electron safeStorage encrypts `codex-credentials.enc` in app user data. Unavailable encryption
(including Linux's plaintext backend) fails closed. OAuth refresh and deletion serialize through
one credential store; refresh tokens never leave main, and storage/provider errors are sanitized.
Disconnect is blocked during a reply, deletes the saved credential, and invalidates an active
Codex worker. The transcript stays visible; reconnect and select a model, or start a new conversation, to continue.
No global Codex/Pi credentials, configuration, or resources are imported or changed.

`models.json` saves only the default connection, Codex model ID, and reasoning level. Main validates
Codex selections against the pinned SDK catalogue. That catalogue is not an account entitlement
check; unsupported models and subscription limits remain provider errors. Changing defaults leaves existing chats on their current model. The direct selector changes
the active chat while retaining context. With an empty chat, applying a default uses it
immediately. Explicit environment API-key configuration remains a separate selectable connection;
it is never an automatic fallback after Codex authentication fails.
A damaged model preference file falls back to demo, even with API environment variables present.
Missing preferences may inherit explicit environment setup on first launch. Stopping a turn
preserves any refresh token already rotated by the provider; logout still serializes deletion.
Codex replies have a ten-minute ceiling for longer reasoning. Stop retains its two-second
forced-worker shutdown bound.

Only one message is processed at a time. Request IDs correlate streamed events. Stop cancels
the active turn; closing the app terminates the worker. A failed or unresponsive worker must
leave the UI usable, and cancellation must not append output from an old turn to a new one.

The user explicitly enabled the complete built-in Pi file and shell tool set on 2026-09-17.
These tools have local user privileges, with no per-command approval broker. The system prompt
requires authorization for otherwise unrequested destructive actions; it is not an OS sandbox.
Desktop observation now uses the on-demand broker below. Future input-control and external
API tools need their own scope and authorization design.
MCP support must preserve images and cancellation and expose only configured tools. A worker
process isolates crashes, but is not an OS security sandbox. Adding tools requires an explicit
permission design and tests for that new boundary.

## On-demand desktop context (reviewed 2026-09-19)

The [desktop broker](../src/main/desktop/controller.ts) makes read-only observations available
to the agent during user turns, without a renderer sharing grant. Renderers cannot request
pixels or generic native operations. Per-turn, correlated worker RPC validates desktop tool
requests and responses. Opaque source IDs expire after sixty seconds, on a fresh listing, or
when their owning turn ends. Main caps requests per turn and permits one OS observation at a time.
Stop, context changes, disposal and deadlines suppress late results.

[Electron capture](../src/main/desktop/electron-provider.ts) lists sources without thumbnails.
The [frame helper](../src/main/desktop/source-capture.ts) opens a hidden sandboxed media renderer
in a separate memory-only session, requests only the chosen source, returns one bounded PNG,
then destroys the renderer. Its six-second deadline also destroys stalled media requests.
Only its fixed main frame can request desktop media; physical camera/audio, navigation and
network requests are denied. The app UI gets no new permission. No all-window thumbnails run.
Capture failure messages are sanitized and remembered per native source for the current reply,
preventing a relist/retry loop while preserving text and permitting recovery on the next turn.
[Windows reading](../src/main/desktop/windows-reader.ts) uses fixed, hidden PowerShell code,
validated numeric window handles, an isolated environment and a bounded UI Automation traversal.
It does not focus, copy, click or change selection. Text, tab names and selection depend on the
application's accessibility provider; protected controls are excluded, but screenshots are not
automatically redacted. The tool never falls back to clipboard or keyboard operations.

The [Pi tools](../src/agent/desktop-tools.ts) include `desktop_observe`, which resolves the
foreground external app, or infers the nearest visible app behind Computer Cat. Its result
identifies that inference and combines accessible text with a screenshot, preserving either
when the other fails. Named-window listing, reading and capture remain available. Text-only
models automatically omit the screenshot from observation. Screen content is untrusted data.
Focused selection/tab tools skip full-page text collection and images. Region capture validates
normalized bounds and crops before downsizing to preserve detail within the image budget.
Native Pi session files persist observations, including images, under the existing per-chat
retention policy. Renderer activity events contain only tool names/status, not observed content.
Independent lock/sleep blocks clear on unlock/resume. No startup/background capture runs.
The existing shell tools remain unsandboxed; this is not a security boundary around the agent.
See [desktop context](desktop-context.md) for usage, limitations and verification.

## Companion presentation and preferences

The [Harness guide](harness-guide.md) is a self-contained HTML build artifact with an exhaustive
typed tool catalog, shared XP tokens and no network or app bridge. A chat-only, no-argument IPC
copies that fixed document out of the app bundle to user data and opens its HTML association.
No arbitrary URL/path opener is exposed. The guide works without the app running once opened.
Reviewed 2026-09-19 against [the opener](../src/main/harness-guide.ts) and
[build plugin](../src/guide/build.ts).

The XP caption bar uses named preload operations to minimize, maximize/restore, and hide the
chat window. Only the chat renderer can request those controls or change companion settings.
The companion can open chat or Options, stop a reply, and request a drag phase. Only the pet
renderer can initiate dragging; main validates the phase, reads desktop cursor coordinates,
uses a five-DIP movement threshold, and clamps its own window to a display work area. Cancellation,
hide, blur, reload, and a thirty-second gesture limit prevent stale drags from revealing controls.
No generic window or IPC interface is exposed.

Pet size, always-on-top, and animation are saved in their own preference file. Main validates a strict
partial update, serializes atomic writes to `preferences.json` in Electron user data, and
broadcasts successful updates to both renderers. Unknown fields, invalid values, and empty
updates are rejected. Missing or corrupt files use defaults; save failures keep the previous
settings and return a message without filesystem details. The Options dialog stages changes until
Apply or OK succeeds. Cancel, Escape, or closing the dialog discards unapplied changes. A pet
preference save failure keeps the live cat unchanged. Tabs save in sequence; if a later tab
fails, Options identifies earlier successful saves and focuses the failed tab with its draft
intact for retry. Reviewed 2026-09-19 against [Options](../src/renderer/src/OptionsDialog.tsx)
and [partial-save coverage](../tests/smoke/desktop.spec.ts).

The cat retains its original transparent silhouette. Size changes stay within the current
display work area. The cat body uses pointer capture and the narrow drag bridge; native drag
regions remain on the chat caption. Renderer code never accesses the OS. Find cat
places the pet inside the display under the pointer and shows it without activating it. Display
changes re-clamp its bounds. Position is session-only.

While Always on top is enabled and the pet is visible, main uses Electron’s screen-saver window
level and reasserts z-order every two seconds, on blur/show, and after resume/unlock. This does
not focus the pet, unhide a deliberately hidden window, or override a disabled preference.
The timer stops on quit. OS secure desktops and exclusive fullscreen surfaces remain outside
the ordinary desktop window stack. See [Electron’s window API](https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level-relativelevel).

The original artwork is clipped into overlapping head, torso, paw and fixed boot layers in an SVG.
Renderer-only [activity selection](../src/renderer/src/pet-activity.ts) derives poses from typed
voice and chat snapshots; it introduces no IPC or capture privileges. CSS animates the layers
and pixel props. Animate cat and OS reduced motion retain readable static poses; dragging and
document hiding pause every layer. A scoped 2.4-second completion reaction cannot replay saved
history. See [cat motion](cat-motion.md). Reviewed 2026-09-19.

## Saved conversations (reviewed 2026-09-17)

Main owns version-1 conversation records under app user data: a validated UUID selects each
JSON transcript and its separate native Pi JSONL context. Renderer requests contain IDs, never
paths. Writes serialize through a temporary file and atomic rename. The initial user message
is saved before the model runs; streaming is checkpointed every half-second and completion
is saved before releasing the busy state. Quit cancels the turn, lets the worker settle, and
waits for any in-flight history change, then flushes writes. Reopening the active chat also
replaces a failed worker with its saved context. Interrupted messages and running tool indicators reopen as stopped.

History lists, resumes, and deletes conversations; New conversation retains the old chat.
Startup opens the most recently updated saved chat. Corrupt metadata is skipped with a visible
notice and left untouched. A corrupt native session fails closed when resumed. The Pi adapter
records transcript offsets to bridge demo-only turns without duplicating native tool context.
Deletion removes both transcript and native context. Files edited by tools are not undone.

Saved content and tool results are local plaintext, retained until explicitly deleted. OAuth
credentials remain in their separate encrypted vault and are never part of session configuration
on disk. Model changes are validated and blocked during replies, then persist on the current
conversation; Options still sets defaults for new conversations.

Pi’s find/grep tools can provision fd/ripgrep into an app-owned pi-runtime cache on first use.
Helper downloads are disabled in smoke tests. Model catalogue network refresh remains disabled.
Bash needs an installed shell; PowerShell is the default suggested shell on Windows.
