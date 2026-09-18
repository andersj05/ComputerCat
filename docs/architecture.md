# Architecture

The initial application is a desktop companion and a controlled Pi SDK integration. It has
a local demo mode that works without credentials. Screen capture, mouse/keyboard control,
external MCP servers, selected-fact user memory, and voice are later features, not implicit privileges.

Developer context is maintained separately in [shared project memory](memory/README.md), entered
through root [AGENTS.md](../AGENTS.md). It is not loaded by the app's Pi resource loader and does
not supply the app’s conversation history. Keep these two forms of memory separate when adding features.

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
navigation, new windows, and browser permission requests are denied. Model output is rendered as Markdown through React elements, with raw HTML skipped,
images reduced to alt text, and links displayed without navigation. The app never imports extensions or instructions discovered in arbitrary folders.

The Pi worker owns a session for the current conversation. Its resource loader is explicitly empty,
its explicit allowlist contains all eight built-in Pi tools, and native Pi sessions are saved per conversation.
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
Future screen-control and external API tools need their own scope and authorization design.
MCP support must preserve images and cancellation and expose only configured tools. A worker
process isolates crashes, but is not an OS security sandbox. Adding tools requires an explicit
permission design and tests for that new boundary.

## Companion presentation and preferences

The XP caption bar uses named preload operations to minimize, maximize/restore, and hide the
chat window. Only the chat renderer can request those controls or change companion settings.
The companion can open chat or Options, stop a reply, and request a drag phase. Only the pet
renderer can initiate dragging; main validates the phase, reads desktop cursor coordinates,
uses a five-DIP movement threshold, and clamps its own window to a display work area. Cancellation,
hide, blur, reload, and a thirty-second gesture limit prevent stale drags from opening chat.
No generic window or IPC interface is exposed.

Pet size, always-on-top, and animation are saved in their own preference file. Main validates a strict
partial update, serializes atomic writes to `preferences.json` in Electron user data, and
broadcasts successful updates to both renderers. Unknown fields, invalid values, and empty
updates are rejected. Missing or corrupt files use defaults; save failures keep the previous
settings and return a message without filesystem details. The Options dialog stages changes until
Apply or OK succeeds. Cancel, Escape, or closing the dialog discards unapplied changes; a save
failure leaves the draft available to retry without changing the live cat.

The cat retains its original transparent silhouette. Size changes stay within the current
display work area. The cat body uses pointer capture and the narrow drag bridge; native drag
regions remain on its grip and the chat caption. Renderer code never accesses the OS. Find cat
places the pet inside the display under the pointer and shows it without activating it. Display
changes re-clamp its bounds. Position is session-only.

While Always on top is enabled and the pet is visible, main uses Electron’s screen-saver window
level and reasserts z-order every two seconds, on blur/show, and after resume/unlock. This does
not focus the pet, unhide a deliberately hidden window, or override a disabled preference.
The timer stops on quit. OS secure desktops and exclusive fullscreen surfaces remain outside
the ordinary desktop window stack. See [Electron’s window API](https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level-relativelevel).

The original artwork is clipped into overlapping head/body layers in an SVG, with blink overlays.
Idle, hover, and thinking motion respect both Animate cat and the OS reduced-motion preference.

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
