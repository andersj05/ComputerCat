# Architecture

The initial application is a desktop companion and a controlled Pi SDK integration. It has
a local demo mode that works without credentials. Screen capture, mouse/keyboard control,
external MCP servers, persistent memory, and voice are later features, not implicit privileges.

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

The Pi worker owns a session for the current app run. Its resource loader is explicitly empty,
its tool allowlist is empty, and session state is in memory. Configuration comes from explicit
environment variables; main passes the selected credential to the worker, never over renderer IPC. The app does not
reuse a global Pi login or scan the user's environment for unrelated providers.

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
The companion can open chat and stop a reply. No generic window or IPC interface is exposed.

Pet size, always-on-top, and animation are the only saved preferences. Main validates a strict
partial update, serializes atomic writes to `preferences.json` in Electron user data, and
broadcasts successful updates to both renderers. Unknown fields, invalid values, and empty
updates are rejected. Missing or corrupt files use defaults; save failures keep the previous
settings and return a message without filesystem details. The UI gives immediate feedback and
restores the previous selection if saving fails. Conversation content remains in memory.

The cat retains its original transparent silhouette. Size changes stay within the current
display work area. Native drag regions move the pet and chat; renderer code never accesses the
OS. Idle and thinking animation respect the operating system reduced-motion preference.
