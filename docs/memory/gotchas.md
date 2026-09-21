# Known pitfalls

Keep reproducible lessons here. Each entry states its scope, evidence, and review date.
Remove obsolete remedies; keep transient environment failures in the relevant handoff.

## Browser text changes need app input events

Reviewed: 2026-09-21. Scope: Windows UI Automation with Electron 44 / Chromium editors.

The owned browser fixture showed that ValuePattern.SetValue updates a contenteditable's DOM
without dispatching an input event, while ordinary inputs and textareas did receive events.
The [helper](../../src/main/desktop/windows-input-script.ts) therefore uses editor-scoped text
selection and guarded keyboard input for Chromium fills. The managed accessibility metadata
does not reliably distinguish these three editor kinds. Do not restore direct browser SetValue
or accept a DOM-only assertion as proof of app state. The [fixture](../../tests/smoke/browser-input.spec.ts)
requires exact text and input events on successful dispatch, or unchanged text on denied focus.
This host verified refusal; positive browser keyboard coverage remains pending. Playwright's
emulated focus and BrowserWindow.isFocused are not substitutes for GetForegroundWindow plus
the native focused control. See [verification scope](../computer-use.md).

## Overlays can win inferred current-window selection

Reviewed: 2026-09-20. When Computer Cat has focus, window z-order is only a guess at the
intended app. The [reader](../../src/main/desktop/windows-reader.ts) skips WS_EX_TOOLWINDOW
and WS_EX_NOACTIVATE windows during that inference, preserving foreground and explicit reads.
These [Windows styles](https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles)
identify floating tools and nonactivating windows; they do not identify every overlay.
The [selection fixtures](../../tests/smoke/window-target.spec.ts) cover both styles and ordinary
topmost apps. The [agent prompt](../../src/agent/runtime.ts) directs recovery through window
listing and a fresh read of a named app. Prompt instructions do not guarantee model compliance;
the reported NVIDIA case has not been reproduced against the actual overlay.

## Windows sandbox identity and Git ownership

Reviewed: 2026-09-17. Scope: this Windows checkout under a separate sandbox account.

`git status` can report dubious ownership because the sandbox user differs from the repository
owner. First confirm the exact intended checkout and owner. Use a command-scoped exception
such as `git -c safe.directory=<verified-absolute-repository-path> status --short --branch`
for that checkout, or run the operation through the approved host context. Do not set
safe.directory to a wildcard or change global Git trust merely to inspect a repository.
Writes to Git metadata may need the host's normal approval mechanism.

Evidence: reproduced during the [memory audit](../audits/2026-09-17-agent-memory.md).

## GitHub sandbox network failures can resemble authentication failures

Reviewed: 2026-09-17. Scope: GitHub CLI on the project owner's Windows machine.

The existing account uses Windows Credential Manager. An offline sandbox failure does not
prove the token is invalid. Retry the relevant command outside the sandbox with the narrowest
appropriate approval before suggesting authentication changes. Never recommend logout/login
based only on a sandboxed result. Do not print tokens while diagnosing this.

Evidence: [project instructions](../../AGENTS.md); remote dev reference refreshed successfully
from the host during the audit. No authentication change was necessary.

## Remove shared dependency junctions before deleting temporary worktrees

Reviewed: 2026-09-20. Scope: Git worktree cleanup on Windows.

A temporary verification worktree linked node_modules to the main checkout with a directory
junction. Removing that worktree with Git traversed the junction, removed shared packages,
and then reported an invalid-argument error. Check for junctions before worktree removal and
unlink each shared dependency junction itself without recursion before deleting the checkout.
If dependencies were affected, restore them with `npm ci` and rerun verification and smoke tests.
Evidence: the promotion cleanup reproduced missing @playwright/test packages during desktop
smoke testing; dependencies are reproducible from [the lockfile](../../package-lock.json).

## Machine-local editor settings

Reviewed: 2026-09-19. `.vscode/settings.json` can contain absolute native-build paths.
It is ignored by [Git](../../.gitignore) and the Git-aware formatter; existing local files
are preserved. Suggested extensions can still be shared.

## PowerShell may select npm.ps1

Reviewed: 2026-09-17. Scope: Windows command invocation.

If execution policy blocks npm.ps1, use `npm.cmd` for the same documented npm commands rather
than changing the user's execution policy. Node must match [.node-version](../../.node-version);
[.npmrc](../../.npmrc) enforces the package engine. Evidence: npm.cmd successfully reports the
installed npm version on the audit machine; [verification](../../CONTRIBUTING.md) is unchanged.

## Vitest configuration may fail before tests run in a restricted Windows sandbox

Reviewed: 2026-09-17. Scope: this checkout under the restricted Windows sandbox.

The baseline verification passed lint and types, then esbuild reported access denied reading
a parent directory while loading vitest.config.ts. This is a test-runner startup failure,
not a failed application test. Retry the same offline verification using the normal host
approval mechanism; do not weaken application isolation or edit dependencies to mask it.
Evidence: the [audit verification record](../audits/2026-09-17-agent-memory.md).

## Proposal documents and dependency defaults are not product capabilities

Reviewed: 2026-09-17. Scope: planning or upgrading the Pi integration.

The [research plan](../research-and-build-plan.md) includes future tools and session restoration.
Current code disables discovered resources; app-owned tools and disk sessions are now enabled. Read the
[capability map](current-state.md) and [adapter](../../src/agent/pi-runtime.ts), then run the
[isolation tests](../../tests/unit/pi-runtime.test.ts) when changing SDK integration.
Do not enable default filesystem discovery to make development memory available to the app.

## Independent checkouts have independent unfinished work

Reviewed: 2026-09-17. Scope: sessions, worktrees, and delegated development.

An uncommitted note in one worktree is absent from another. A handoff's listed branch/base may
also differ from the receiver's checkout. Transfer the intended commits or explicitly pass
the sanitized handoff; inspect Git before continuing. Never resolve that mismatch by resetting
someone else's changes. Evidence: [contribution workflow](../../CONTRIBUTING.md) and the
[handoff protocol](handoffs/README.md).

## Codex worker tokens need an explicit request-auth adapter

Reviewed: 2026-09-17. Scope: Pi 0.85.1 subscription integration.

The built-in Codex provider is OAuth-only. Setting a runtime API key does not make it accept an
access token; session setup reports an unconfigured provider. Main owns OAuth and refresh, while
the [Pi worker adapter](../../src/agent/pi-runtime.ts) registers a narrow auth resolver for the
access token sent over its private port. Do not move refresh credentials into the renderer or
worker to work around this. [SDK tests](../../tests/unit/pi-runtime.test.ts) verify rotation and
ambient-key isolation; [desktop tests](../../tests/smoke/codex.spec.ts) exercise real worker replies.

The pinned provider compresses SSE request bodies with Zstandard when available. Offline
network fixtures must decode that format before checking request payloads; a fixture's JSON
parse failure is not a provider outage. Evidence: the [worker fixture](../../tests/fixtures/codex-worker.mjs).


## Windows off-screen recovery must move before resizing

Reviewed: 2026-09-17. Scope: Electron companion windows on Windows with display scaling.

Moving a window far off-screen can change the DIP size reported by getBounds. Combining a
move back to a display with a resize in setBounds produced an oversized cat extending beyond
the work area. Move to the destination first, then setBounds with the configured size and clamp
the actual result only if needed. setSize after the move kept the non-resizable window at its
previous size when shrinking. Use the placement helper for recovery, preference changes, and
body dragging so repeated position updates cannot accumulate size rounding.
Evidence: [placement helper](../../src/main/index.ts) and the off-screen/display-change cases in
[desktop smoke tests](../../tests/smoke/desktop.spec.ts).

## Playwright forces renderer visibility during Electron smoke tests

Reviewed: 2026-09-19. Scope: Playwright 1.63.0 and Electron 44.4.1 on Windows.

Playwright enables CDP focus emulation in its own page session. Hiding a native window still
leaves `document.hidden` false under automation; disabling emulation in a second CDP session
does not undo the first session's override. Do not change application background throttling
to compensate. The [cat smoke test](../../tests/smoke/desktop.spec.ts) exercises the Page
Visibility event boundary explicitly and removes its temporary document property afterward.
A separate demo launch without Playwright verified that native hide sets document.hidden and
pauses the rig, and showInactive resumes it. The production listener uses the unmodified DOM API.
See [Electron's visibility contract](https://www.electronjs.org/docs/latest/api/browser-window#page-visibility)
and the [pet listener](../../src/renderer/src/Pet.tsx).

## Send acknowledgements and reply completion are separate events

Reviewed: 2026-09-17. Scope: renderer drafts and Electron smoke tests.

Main can broadcast a turn before the send IPC promise settles. Clear only the unchanged draft
revision on acceptance; comparing its text can erase a newly retyped identical message. A
controlled delayed response reproduced this loss; [desktop tests](../../tests/smoke/desktop.spec.ts)
cover retyping, unchanged accepted drafts, and rejected sends.

An absent Stop button immediately after clicking Send does not prove the new reply completed.
Wait for the new assistant message's completed state, then idle and the send acknowledgement.
The [chat helper](../../tests/smoke/chat.ts) uses the next message index so a previous reply
cannot satisfy the assertion. This corrects premature model/context assertions in the packaged
Windows [Codex tests](../../tests/smoke/codex.spec.ts).

Wait for native dialogs to close before composing, too. Options saves and History opens are
asynchronous; Playwright's fill action does not check whether a modal obscures the input.
The same helper waits for no open dialog before filling and counts replies only after a
history switch completes. See [Playwright actionability](https://playwright.dev/docs/actionability).

A disabled Apply button and a cleared error can also mean a save is in flight, not finished.
After retrying a failed preference write, poll the persisted preference before asserting the
new state. The packaged Windows run exposed this in the Options retry smoke test.


## Speech model CDN and Windows native paths

Reviewed: 2026-09-18. Scope: local Whisper input.

Hugging Face redirects the pinned base.en asset to us.aws.cdn.hf.co. An allowlist that only
includes older LFS/Xet hosts rejects the download before receiving bytes. Adding this exact
observed host fixed real cancel/retry/verification/offline-reuse checks; continue to reject
arbitrary redirect destinations and verify SHA-256. See [model storage](../../src/main/voice/model-store.ts).

Upstream narrow-path file initialization cannot cover all Windows usernames. The
[native helper](../../native/whisper-helper/src/main.cpp) uses the model-loader API backed by
UTF-8-to-wide Windows file opening. Real inference from Unicode/space paths passes with a
minimal PATH. Portable Turbo can exceed the inference deadline; guarded AVX2 improves CPU
performance, and the smaller model remains an explicit choice. See
[native evidence](../implementation/whisper/native-evidence.md).

## Windows capture errors from unrelated windows

Reviewed: 2026-09-19. Scope: Electron 44 desktop observation.

Requesting nonzero thumbnails with desktopCapturer.getSources captures every source of the
requested class before JavaScript can filter it. An uncapturable unrelated window may emit
WGC CreateForWindow / E_INVALIDARG errors; the log alone does not identify the selected app.
See [Electron issue 51910](https://github.com/electron/electron/issues/51910) and
[capture source](https://github.com/electron/electron/blob/v44.4.1/shell/browser/api/electron_api_desktop_capturer.cc).
List with zero-size thumbnails, then request a media frame for the exact selected source.
Do not suppress Chromium errors globally or work around protected windows.

The dedicated local media frame's legacy desktop request supplies mediaTypes=[] in this
Electron version, unlike microphone/camera device requests. Permission checks may have an
empty requestingUrl; only accept this for the verified fixed main frame. The native fixture
proved this contract, pixel capture and cancellation. Keep physical device permissions denied.
Evidence: [frame helper](../../src/main/desktop/source-capture.ts),
[boundary tests](../../tests/unit/source-capture.test.ts) and
[native test](../../tests/smoke/native-capture.spec.ts).

## Keep accessibility helper module loading explicit

Reviewed: 2026-09-19. Scope: Windows PowerShell 5.1 accessibility helper.

Cold hosted Windows runs exposed fixture startup and first-read timeouts. The fixed
[reader](../../src/main/desktop/windows-reader.ts) disables module auto-loading and imports
only the built-in Utility module by its PSHOME path. Its child environment disables the
per-user module analysis cache with PSModuleAnalysisCachePath=NUL; the eight-second read
deadline remains unchanged. The owned [fixture](../../tests/smoke/windows-reader.spec.ts)
uses the same initialization and supplies TEMP/TMP for its C# compilation.
The native fixture passes locally; hosted timing is still an environment-dependent check.
See Microsoft's [module cache documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_environment_variables).

## Preserve requested window dimensions at fractional DPI

Reviewed: 2026-09-19. Scope: the transparent desktop cat on Windows.

Electron's native bounds and renderer viewport can round by one DIP at fractional display
scales. Feeding the native size into every resize step accumulates growth and moves the cat
anchor. Keep the last requested bounds in main, apply screen-edge corrections there, and use
those bounds for subsequent drag/resize gestures and panel reopening. Allow for endpoint
rounding when comparing native/renderer observations in tests, while requiring repeated
opposite steps to return to the same size.
Evidence: [window placement](../../src/main/index.ts), [resize geometry](../../src/main/pet-window.ts)
and [pointer/keyboard resize checks](../../tests/smoke/desktop.spec.ts).

## Protected branch promotion

Reviewed: 2026-09-19 against the GitHub branch protections and
[ancestry sync PR](https://github.com/andersj05/ComputerCat/pull/27).

Both dev and main require pull requests plus the Quality and Windows desktop checks.
Main also requires the source branch to be up to date. A previous main promotion creates
a merge commit that dev may not contain, even when their files previously matched.
Before promotion, fetch origin and check whether origin/main is an ancestor of origin/dev.
If not, start a feat/ sync branch from origin/dev, merge origin/main, and merge that PR into
dev first. Direct pushes and GitHub's Update branch operation cannot update protected dev.
Then merge the dev-to-main PR after its checks pass. Keep branch protections enabled.
