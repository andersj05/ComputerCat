# Architecture

The initial application is a desktop companion and a controlled Pi SDK integration. It has
a local demo mode that works without credentials. Screen capture, mouse/keyboard control,
external MCP servers, persistent user memory, and voice are later features, not implicit privileges.

Developer context is maintained separately in [shared project memory](memory/README.md), entered
through root [AGENTS.md](../AGENTS.md). It is not loaded by the app's Pi resource loader and does
not provide conversation persistence. Keep these two forms of memory separate when adding features.

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
navigation, new windows, and browser permission requests are denied. Model output is rendered
as plain text. The app never imports extensions or instructions discovered in arbitrary folders.

The Pi worker owns a session for the current conversation. Its resource loader is explicitly empty,
its tool allowlist is empty, and session state is in memory. Main resolves the selected connection
before each turn and sends validated configuration over the private worker port. The worker's
environment contains no provider credentials. Model identity and reasoning remain fixed within
that worker, while the access token can rotate without replacing the conversation.
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
Codex worker. The transcript stays visible; New conversation is required before sending again.
No global Codex/Pi credentials, configuration, or resources are imported or changed.

`models.json` saves only the default connection, Codex model ID, and reasoning level. Main validates
Codex selections against the pinned SDK catalogue. That catalogue is not an account entitlement
check; unsupported models and subscription limits remain provider errors. Existing chats keep
their active model until New conversation. With an empty chat, applying a default uses it
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

Future computer and API tools belong behind a broker that checks scope and authorization.
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
failure leaves the draft available to retry without changing the live cat. Conversation content
remains in memory.

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
