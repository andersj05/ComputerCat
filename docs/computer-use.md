# Computer use

Reviewed: 2026-09-21. Implemented on `feat/computer-use`; see verification scope below.

The first increment extends the existing desktop broker with window inspection and targeted
click, fill, text insertion, key and scroll operations. Windows UI Automation supplies control
identities and supported operations. The agent follows observe → act → verify, using a fresh
observation for every action. Ordinary browser forms and accessible native editors are the
initial target; arbitrary canvas controls and a browser DOM connection are separate work.

| Tool | Operation |
| --- | --- |
| `desktop_inspect` | Current app or listed source; returns text and up to sixty controls with advertised actions. Optional `query` searches a literal part of the control name before that output limit. |
| `desktop_click` | Invoke/select/toggle/expand the exact observed control through its accessibility pattern. |
| `desktop_fill` | Replace an editor's value with up to 8,000 literal characters, without a trailing submit key. |
| `desktop_type_text` | Insert Unicode text at the observed editor's caret/selection with focus checks; no clipboard. |
| `desktop_press_key` | One allowlisted editing/navigation key in the observed control. Enter/Space may activate or submit. |
| `desktop_scroll` | One small/large increment in an observed scrollable region. |

Actions return a new observation when possible. Public observations bound text to 8,000
characters and each field preview to 1,000, flagging truncation; the native fingerprint covers
the control value independently of that preview. A long/truncated field needs additional
reading before claiming full verification. Drafts and observations follow normal Pi retention.

## Discovery and latency (reviewed 2026-09-21)

A missing control in the initial result is not evidence that the app does not expose it.
Use desktop_inspect with query set to "Reply" to search names case-insensitively before the
sixty-control output limit. The scan uses UI Automation's control view, traverses up to
32 levels and 2,000 nodes within its existing 3.5-second traversal budget, and marks incomplete
results. Invisible/empty containers do not hide visible descendants; password subtrees remain
excluded. Search still cannot find controls an app does not expose or materialize.

Current-app inspection resolves only window identity before the actionable scan. Action lookup
stops when it finds the exact runtime ID, then revalidates the target and user activity.
These remove redundant traversal; every request still starts PowerShell and compiles its fixed
helper, and model/network latency remains additional. No end-to-end speedup has been measured.
The [browser fixture](../tests/smoke/browser-input.spec.ts) checks a nested Reply control after
70 toolbar buttons, including its native click and unsent outcome. Focus refusal is reported
separately from discovery failure, with activation and reinspection as the next step.

## Boundaries

- Main owns native access. The existing private worker RPC validates requests, limits calls,
  serializes operations and observes Stop, turn changes, lock, sleep and quit. The renderer
  receives tool activity, never native handles or an input API.
- An inspection issues an opaque observation ID and bounded element IDs. They belong to one
  turn, expire, and are consumed before an action is dispatched. A fresh inspection invalidates
  earlier targets. Native window/process, control identity, geometry and field contents are
  checked again before input. Changed user input or foreground windows require reinspection.
- UI Automation patterns are preferred. Keyboard insertion is restricted to an observed,
  writable editor, with foreground and focus checks. No clipboard substitution, administrator
  elevation, arbitrary scripts, global coordinates or hidden browser attachment is introduced.
- Chromium fill uses the editor's TextPattern selection and guarded Unicode keyboard input.
  Its ValuePattern setter can change a contenteditable's DOM without firing the input events
  that web apps need. A visible value alone does not prove an app received or saved a draft.
- Literal line breaks in keyboard text input use Shift+Enter, because Chromium ignores
  Unicode packet newline characters. CRLF/CR/LF normalize to one line break. App keyboard
  handlers still apply; no plain Enter or trailing submit key is appended.
- Results distinguish rejection before dispatch from an uncertain or dispatched action. Fresh
  accessible state accompanies completed actions when available. A timeout is never permission
  to repeat an action blindly. Cancellation cannot undo already dispatched input.
- The task authorizes relevant editing and navigation. Drafting does not authorize sending,
  publishing, buying or deleting. Screen content remains untrusted task data. These intent rules
  are model policy, not a new OS sandbox; the existing Pi shell already has user privileges.

## Verification plan

The [automated test lab](computer-use-testing.md) repeats the owned fixtures and records
per-operation outcomes, helper initialization and full call latency. Use it to establish a
strict baseline before optimizing; diagnostic focus refusals never qualify as keyboard success.

Offline tests exercise malformed requests, stale/cross-turn targets, cancellation, native
process cleanup, unsupported controls, changed focus and ambiguous outcomes. Real Windows tests
operate only a synthetic window created for the test, including an unsent email editor. A
scripted model test checks the complete worker/tool loop independently of model intelligence.
Optional live task trials remain separate and must report their actual measured scope.

On 2026-09-21 both the [owned Windows editor](../tests/smoke/computer-input.spec.ts) and
[owned Chromium editor](../tests/smoke/browser-input.spec.ts) passed with
COMPUTERCAT_REQUIRE_NATIVE_FOCUS=1. This requires actual native keyboard dispatch, exact editor
values, browser input events and unsent status. Coverage includes native fill/type/key/scroll,
stale-field/window rejection, browser subject/textarea/contenteditable replacement, exact multiline
text, no unmodified Enter key, and name search plus native click on a deeply nested Reply button
after seventy toolbar controls. Earlier refusal-only runs did not cover successful typing; the
strict run exposed and led to a fix for Chromium dropping Unicode packet line breaks.
Electron/Playwright's emulated focus alone remains insufficient evidence. No real account or
website was operated; Outlook-specific and live-model completion are unmeasured. The
[helper lifecycle tests](../tests/unit/windows-input.test.ts) check cancellation/timeout ownership,
bounded output, strict input and environment isolation. These are machinery checks, not live
model completion rates.

Run `npm run test:computer-use` for the two owned native fixtures. Default smoke coverage accepts
only explicit foreground refusal with unchanged text and records a coverage annotation. For
interactive keyboard qualification, set `COMPUTERCAT_REQUIRE_NATIVE_FOCUS=1` before running that
command. It then requires successful keyboard dispatch, exact editor contents and browser input
events; a focus refusal fails the check. This test flag changes assertions, never Windows focus
permissions. Run from an interactive Windows session and do not use other apps during the check.

Live task reliability: not measured for this change. The maintained
[manual catalog](../evals/catalog.json) adds `draft-in-app`, `draft-injection` and `changed-editor`
with a local synthetic form. Plan three attempts each with
`npm run eval:init -- --run computer-use --tasks draft-in-app,draft-injection,changed-editor`.
The controlled-tool GPT-6 Luna runner grades `draft-in-app` against a synthetic form. It does not
yet grade `draft-injection` or `changed-editor`, or measure real native-app completion.
The [qualification handoff](memory/handoffs/2026-09-21-computer-use-validation.md) records the
remaining interactive checks and concrete next steps.

Relevant existing contracts: [desktop broker](../src/main/desktop/controller.ts),
[worker owner](../src/main/worker-runtime.ts), [desktop tools](../src/agent/desktop-tools.ts),
[task evaluations](task-evaluations.md).

Primary sources reviewed 2026-09-21:
[UI Automation patterns](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlpatternsoverview),
[SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput),
[foreground restrictions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow).
Windows may deny foreground activation and input into higher-integrity applications. Those
failures must be reported rather than bypassed.
