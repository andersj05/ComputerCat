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
environment variables, with credentials held only in the worker environment. The app does not
reuse a global Pi login or scan the user's environment for unrelated providers.

Only one message is processed at a time. Request IDs correlate streamed events. Stop cancels
the active turn; closing the app terminates the worker. A failed or unresponsive worker must
leave the UI usable, and cancellation must not append output from an old turn to a new one.

Future computer and API tools belong behind a broker that checks scope and authorization.
MCP support must preserve images and cancellation and expose only configured tools. A worker
process isolates crashes, but is not an OS security sandbox. Adding tools requires an explicit
permission design and tests for that new boundary.

