# Desktop context

Reviewed: 2026-09-19. Implemented for Windows; application accessibility coverage varies.

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

## Verification

Offline [broker](../tests/unit/desktop-controller.test.ts),
[capture](../tests/unit/desktop-provider.test.ts),
[worker](../tests/unit/worker-runtime.test.ts) and
[tool](../tests/unit/desktop-tools.test.ts) tests cover denied grants, stale sources, invalid
requests, image preservation, text-only models, timeouts, transport failure and late-result
suppression. [Real Pi tests](../tests/unit/pi-runtime.test.ts) pass image blocks through the
actual SDK loop without a paid provider.

[Sharing smoke tests](../tests/smoke/desktop-context.spec.ts) exercise both Electron windows,
consent, renderer trust, narrow layouts and lifecycle revocation with real desktop capture
disabled. The [native Windows smoke](../tests/smoke/windows-reader.spec.ts) reads only a
synthetic WPF fixture window and verifies title, text, selected text, tab names, password
exclusion and unchanged selection. The [supervisor tests](../tests/unit/windows-reader.test.ts)
cover malformed/oversized output, timeout, spawn failure and cancellation. Actual third-party
browser/app coverage and live model answer quality are not established by these fixtures.

The static helper uses Microsoft's read-only
[GetSelection](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getselection),
[GetVisibleRanges](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getvisibleranges)
and [IsPassword](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.automationelement.automationelementinformation.ispassword)
APIs. A legacy WinForms RichTextBox fixture did not expose selection through TextPattern;
the WPF fixture did. Missing selection is reported without a clipboard/input fallback.

See the [broker](../src/main/desktop/controller.ts),
[capture provider](../src/main/desktop/electron-provider.ts),
[shared contract](../src/shared/desktop.ts), and
[Electron capture API](https://www.electronjs.org/docs/latest/api/desktop-capturer).
