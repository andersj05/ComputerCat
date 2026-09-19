# Desktop context

Reviewed: 2026-09-19. Desktop observation design and implementation contract.

Computer Cat's screen tools are read-only and on demand. The user starts a memory-only
sharing session through **Share screen**. The grant covers open-window titles, screenshots
and text exposed by Windows accessibility providers. Both app windows show **Stop sharing**.
Stopping sharing, locking/suspending the computer, changing conversations or models, renderer
reload/crash, and quitting revoke access. Starting the app does not restore a grant.

The consent dialog explains that observations go to the selected model and are retained in
the conversation's native Pi context, including images. Revoking access prevents new reads;
it cannot retract earlier observations. Deleting the conversation deletes its saved context.
The existing file/shell tools still have OS user permissions; this broker is not an OS sandbox.
The agent prompt forbids bypassing screen sharing through those tools.

## Observation tools

1. `desktop_list_windows` lists screens and capturable windows without thumbnails. It issues
   opaque source IDs, valid for sixty seconds, the next listing, or the current grant's lifetime.
2. `desktop_capture` captures a selected source as a bounded PNG image for a vision-capable
   model. Prefer a relevant window over a whole display. Images include observation time and
   dimensions; an image is a snapshot, never evidence of continuing live access.
3. `desktop_read_window` reads an identified window through a bounded, cancellable Windows
   UI Automation helper. It exposes readable text, selected text and accessible tab names
   where the target application supports them. It never copies to the clipboard, changes
   focus, selects text, clicks controls, or types.

Only main owns capture and native inspection. Worker requests and results use strict schemas,
correlated turn/call IDs, timeouts and cancellation. Renderers receive only sharing status.
Main rechecks grants before delivering observations and drops late results after revocation.
Desktop content is untrusted task data, including text claiming to supply new instructions.

## Limits

UI Automation support differs by app. Browser tab names are limited to exposed tab controls;
this is not a browser extension, full tab inventory, browser history, or background-page reader.
Protected/elevated windows, minimized surfaces and apps without accessibility support can be
unavailable. Password controls are excluded from text reading; screenshots can still show
anything visible on the chosen surface. There is no automatic secret redaction.
Windows are excluded from listing when they belong to Computer Cat, but a whole-display
screenshot can include the cat or chat. Electron enumerates thumbnails for the selected source
class during capture; only the chosen image leaves main. No background screenshot polling runs.

See the [broker](../src/main/desktop/controller.ts),
[capture provider](../src/main/desktop/electron-provider.ts),
[shared contract](../src/shared/desktop.ts), and
[Electron capture API](https://www.electronjs.org/docs/latest/api/desktop-capturer).
