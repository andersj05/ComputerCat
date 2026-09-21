# Desktop context

Reviewed: 2026-09-20. Implemented for Windows; application accessibility coverage varies.

Ask a connected model “What is this page?”, “Explain this error” or “Summarize my selected
text.” The agent chooses tools during the request, including messages sent through Talk.
There is no Share screen button, grant dialog, startup scan or background screenshot loop.
The normal tool activity and Stop controls show and cancel work. Demo mode never reads the
desktop. Lock/sleep blocks observations; unlock/resume makes tools available again.

## Observation tools

| Tool | Purpose |
| --- | --- |
| `desktop_observe` | Start with the current app. Returns its identity, accessible text, selection, exposed tabs and a screenshot together. An optional sourceId chooses a listed window; includeScreenshot=false requests text only. |
| `desktop_list_windows` | Find a named app, compare windows, or recover from an unavailable current app. Lists windows and displays without thumbnails. |
| `desktop_capture` | Take a fresh image of an exact sourceId from this turn's observation or listing. Prefer a window to a whole display. |
| `desktop_read_window` | Read accessible text, selected text and tab names from an exact window sourceId without taking an image. |
| `desktop_read_selection` | Read only the selection from the current app or a specified window. Preserve whitespace; skip full-page text collection and screenshots. |
| `desktop_list_tabs` | Read exposed tab titles from the current app or a specified window without page text or images. |
| `desktop_capture_region` | Inspect a smaller part of a previously observed source. Supply x, y, width and height as fractions of the whole source, from 0 to 1. |
| `desktop_read_page` | Read up to eight exposed document titles and optional HTTP/HTTPS addresses from the current app or a specified window. No body text, screenshot or hidden tabs. |
| `desktop_list_controls` | Read up to sixty visible named controls with their roles and enabled states. No field values or control actions. |
| `desktop_find_text` | Search a fresh accessible-text snapshot for a literal phrase (up to 200 characters); return up to five short excerpts with offsets and truncation indicators. |

Observe defaults to the foreground external app. If Computer Cat owns the foreground window,
the helper walks down the window order to the first visible, nonminimized, uncloaked external
window with a title, skipping floating tool windows and nonactivating overlays by their Windows
extended styles. This filter only applies to inferred targets; foreground and explicitly chosen
windows remain readable. It returns foreground or behind-assistant as provenance. This is a
bounded inference, not a guarantee of the user's intent or a history of focused applications.
The agent should check the app/title against the question, list alternatives when needed,
and ask which app only when the available evidence does not resolve the ambiguity.

Observation keeps text if capture fails and keeps the image if accessibility is unavailable.
Text-only models automatically omit images. Screenshots are bounded to 1920 × 1080 and sent
as image content, not base64 text. Snapshot timestamps distinguish an observation from a
live feed. Opaque source IDs are valid for the same turn only, at most sixty seconds, and
until the next listing or cancellation. A changed/closed source requires a fresh observation.
When capture fails, the broker remembers that source for the reply. Relisting does not trigger
another capture of the same failed source. The agent can use text, selection, tabs or another
source; a new user message permits a fresh attempt. Available text survives a capture failure.
Region capture crops the source frame before downsizing, so details can remain readable
without sending another full-window image. Rectangles must fit entirely inside the source.

Page identity uses visible UI Automation Document controls and their optional ValuePattern.
Only complete HTTP/HTTPS addresses without embedded credentials are returned; missing addresses
are never inferred from titles or body text. Results are document candidates, not proof of active
browser navigation. The helper skips document descendants for this mode. Control listing reads
names, types and enabled states, skips protected controls, and provides no actionable IDs.
Text search reads up to 12,000 exposed characters, then returns matching excerpts rather than
the whole text. It does not scroll or use the application's Find command. `sourceTruncated`
means some source content was omitted; `hasMoreMatches` means more than five matches occurred
inside that snapshot. Empty results never prove that content or controls do not exist.

## Harness boundaries

Reviewed 2026-09-20: six [everyday utilities](harness-improvements.md) now share this broker:
current time/folder paths, clipboard text read/write, open URL/folder and reveal file. They are
separate from the ten read-only observation tools above. The same cancellation, lock/sleep,
deadline and request budget apply; the serial slot spans both families. Already dispatched
OS actions cannot be undone by Stop. Clipboard access is request-driven prompt policy, with
content retained in Pi context. No new renderer clipboard or opener API is exposed.

Main owns source selection and native inspection. The chat/pet renderers have no desktop
observation or permission API. A separate hidden, sandboxed media renderer captures one frame
of the exact selected source and is destroyed afterward, including on cancellation or timeout.
Its memory-only session permits only its fixed main frame's desktop request, blocks network
access and rejects camera/microphone requests. Strict schemas validate private worker RPC;
main allows twenty desktop requests per turn and one OS operation at a time. Each request has
a fifteen-second deadline; frame capture has a separate six-second ceiling.
Stop, worker failure/disposal, context changes and renderer restarts cancel pending work and
drop late results. Independent lock and sleep blocks cannot accidentally unlock one another.

Windows text reading uses a fixed, hidden PowerShell/MTA child with a minimal environment,
validated native handles, an eight-second process deadline and bounded output. UI Automation
traversal has node, depth, time and text limits. It never changes focus, selects text, clicks,
types, or copies to the clipboard. Desktop content is untrusted task data, including text
claiming to give instructions. The prompt discourages unrelated observations and forbids
shell, clipboard, browser-data or debug-port workarounds for protected/locked surfaces.
The existing file/shell tools retain OS user privileges; this is not an OS sandbox.

## Coverage and retention

UI Automation support differs by app. Tab names are limited to exposed controls; these tools
are not a browser extension, complete tab inventory, history reader or background-page reader.
Protected/elevated windows, minimized surfaces and apps without accessibility support may be
unavailable. Password controls are excluded from text reading; screenshots can show anything
visible on the chosen surface. There is no automatic secret redaction.

Computer Cat's own windows are excluded as individual sources, but a display screenshot may
include the cat/chat. Listings always request zero-size thumbnails. Capture addresses one
source through Electron's desktop media stream, so unrelated uncapturable windows are never
asked for thumbnails. Source identity is rechecked after capture. Observations go to the selected model and persist
in the conversation's local native Pi context, including images. Deleting that conversation
deletes its saved context. Stop prevents pending observations from being delivered; it does
not retract results already provided to the model.

## Verification

Offline [broker](../tests/unit/desktop-controller.test.ts),
[capture](../tests/unit/desktop-provider.test.ts),
[worker](../tests/unit/worker-runtime.test.ts) and
[tool](../tests/unit/desktop-tools.test.ts) tests cover automatic observation, partial results,
source expiry and turn scope, invalid requests, images, text-only models, lock/sleep,
timeouts, transport failures and late-result suppression. [Real Pi tests](../tests/unit/pi-runtime.test.ts)
pass combined text/image blocks through the SDK loop without a paid provider.
[Codex worker smoke](../tests/smoke/codex.spec.ts) sends a natural screen question through the
actual Electron utility process, returns generated text/image context to an offline model,
and checks locking and automatic recovery without sharing UI or real desktop capture.

[Native capture smoke](../tests/smoke/native-capture.spec.ts) verifies actual pixels from an
owned generated window in a separate Electron process, with source enumeration disabled,
plus cancellation and media
renderer cleanup. [Capture boundary tests](../tests/unit/source-capture.test.ts) exercise
permissions, renderer failures, deadline, cancellation, image limits and invalid IDs.
Native coverage also checks a region's pixel content, focused selection/tab reads and
whitespace preservation. Empty selection/tab output is an accessibility limitation, not
proof that the app has no selection or tabs.

The [native Windows smoke](../tests/smoke/windows-reader.spec.ts) reads an owned synthetic
WPF window and verifies title, text, exact selection, tab names, password exclusion and
unchanged selection. It also exercises the compiled current-window helper with the starting
HWND replaced by that fixture, never the user's actual foreground. The
[supervisor tests](../tests/unit/windows-reader.test.ts) cover malformed/oversized output,
timeout, spawn failure and cancellation. These fixtures establish harness behavior, not
third-party app coverage or live model tool-choice/answer quality.

The owned WPF document peer also verifies actual URL ValuePattern reading, named disabled
controls, and focused reads that omit unrelated text and protected fields. The three new tools
run through the real offline Pi worker in [Codex smoke](../tests/smoke/codex.spec.ts).
The reader follows Microsoft's [Document control contract](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-supportdocumentcontroltype);
URL exposure remains application-specific.

The static helper uses Microsoft's read-only
[GetSelection](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getselection),
[GetVisibleRanges](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getvisibleranges),
[IsPassword](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.automationelement.automationelementinformation.ispassword),
[GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)
and [GetWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindow).
A legacy WinForms RichTextBox fixture did not expose selection through TextPattern; the WPF
fixture did. Missing selection has no clipboard/input fallback.

See the [broker](../src/main/desktop/controller.ts),
[capture provider](../src/main/desktop/electron-provider.ts),
[shared contract](../src/shared/desktop.ts), and
[Electron capture API](https://www.electronjs.org/docs/latest/api/desktop-capturer).
