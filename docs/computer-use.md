# Computer use

Reviewed: 2026-09-21. Windows native adapter and targeting boundary implemented;
agent integration and release verification are in progress on `feat/computer-use`.

The first increment extends the existing desktop broker with window inspection and targeted
click, fill, text insertion, key and scroll operations. Windows UI Automation supplies control
identities and supported operations. The agent follows observe → act → verify, using a fresh
observation for every action. Ordinary browser forms and accessible native editors are the
initial target; arbitrary canvas controls and a browser DOM connection are separate work.

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
- Results distinguish rejection before dispatch from an uncertain or dispatched action. Fresh
  accessible state accompanies completed actions when available. A timeout is never permission
  to repeat an action blindly. Cancellation cannot undo already dispatched input.
- The task authorizes relevant editing and navigation. Drafting does not authorize sending,
  publishing, buying or deleting. Screen content remains untrusted task data. These intent rules
  are model policy, not a new OS sandbox; the existing Pi shell already has user privileges.

## Verification plan

Offline tests exercise malformed requests, stale/cross-turn targets, cancellation, native
process cleanup, unsupported controls, changed focus and ambiguous outcomes. Real Windows tests
operate only a synthetic window created for the test, including an unsent email editor. A
scripted model test checks the complete worker/tool loop independently of model intelligence.
Optional live task trials remain separate and must report their actual measured scope.

The [owned Windows editor test](../tests/smoke/computer-input.spec.ts) verified multiline fill,
save without send, changed-field/window rejection and scrolling on 2026-09-21. Windows denied
foreground activation on this host; keyboard typing/key success was not exercised, and refusal
left the field unchanged. The [owned Chromium editor test](../tests/smoke/browser-input.spec.ts)
verified subject, textarea and contenteditable replacement against the DOM, followed by save
without send. No real account or website was operated. The
[helper lifecycle tests](../tests/unit/windows-input.test.ts) check cancellation/timeout ownership,
bounded output, strict input and environment isolation. These are machinery checks, not live
model completion rates.

Relevant existing contracts: [desktop broker](../src/main/desktop/controller.ts),
[worker owner](../src/main/worker-runtime.ts), [desktop tools](../src/agent/desktop-tools.ts),
[task evaluations](task-evaluations.md).

Primary sources reviewed 2026-09-21:
[UI Automation patterns](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlpatternsoverview),
[SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput),
[foreground restrictions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow).
Windows may deny foreground activation and input into higher-integrity applications. Those
failures must be reported rather than bypassed.
