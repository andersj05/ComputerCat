# Windows XP presentation

The transparent cat is the app's character. Keep its full silhouette and original proportions.
The surrounding interface follows XP's desktop conventions: a compact messenger window, a
Luna caption, Tahoma text, cream controls, inset white panes, and small colored toolbar icons.

The app mark is an original pixel cat in a cream CRT monitor, shared by window captions,
the taskbar, tray and Windows installer. [The generator](../scripts/generate-icons.mjs) writes
the SVG, 256-pixel PNG and multi-size Windows ICO in assets; run `npm run icons:generate`
after editing its pixel shapes. The desktop pet retains its original artwork. Reviewed 2026-09-20.

## Layout and copy

- One conversation pane and one message box. No sidebar, dashboard cards, decorative scenery,
  hero headings, or repeated brand introductions.
- In the full chat window, the toolbar contains New conversation, History, Options and Desktop.
  A compact model/reasoning row below it changes the current chat without resetting its context.
- Two plain starter links prepare editable drafts. They do not send anything automatically.
- Speaker names and text form a plain chat log. Streaming appears in the status bar; Stop stays
  next to the message box and is also available from the cat.
- The full chat window's status bar reports activity and the current mode. Put details in Options instead of
  repeating them around the workspace.
- Use labels that identify an action or setting. Avoid slogans and descriptions of obvious UI.
- With the panel closed, Talk, Chat and Options sit beside the cat; Stop replaces Talk during work.
  Chat opens the desktop conversation panel without a microphone; the dock then hides.
  Clicking the cat while the panel is closed toggles its model shortcut; Escape and blur hide it. Drag the body
  to move it, retaining an open panel and the artwork size. Reviewed 2026-09-19.
- Animate the original artwork with planted boots, articulated paws, expressive head movement,
  blinks and an occasional wink. Use distinct poses and small pixel props for listening,
  transcription, thinking, tool work, text replies, review and completion; see [cat motion](cat-motion.md).
  Active status remains readable with controls hidden. Pause motion while dragging or hidden;
  retain static poses for reduced motion or when Animate cat is unchecked. Options previews
  each activity without changing the live cat or starting voice/model work. Reviewed 2026-09-19.

## Controls and dialogs

Desktop context (reviewed 2026-09-19) is selected by the agent through tools when the user asks
about the screen. There is no Share screen button or consent dialog. The existing tool activity
and Stop controls communicate progress and cancellation in chat and on the cat. See
[desktop context](desktop-context.md) and [worker smoke coverage](../tests/smoke/codex.spec.ts).

Use the same blue caption, cream buttons, dotted keyboard focus, green checks, blue fieldset
legends, and orange selected-tab edge throughout. Caption buttons perform native window
operations through the typed preload bridge. Close hides chat while the desktop pet stays open.

Options is an XP property sheet with Desktop cat, Models, Voice, Harness guide, and General tabs. Stage changes until Apply
or OK. Cancel, Escape, and the dialog's close button discard unapplied changes. If a pet
preference save fails, keep the draft open and the running cat unchanged.
When saving several tabs, keep successful saves, identify them in the error, and focus the
tab that failed. Its draft stays available for retry. Reviewed 2026-09-19 against
[Options](../src/renderer/src/OptionsDialog.tsx) and [desktop coverage](../tests/smoke/desktop.spec.ts).
Models uses native select controls for the default connection, model, and reasoning. Saving a
default keeps existing messages and their model; new or empty chats use the new default. Account sign-in
and Disconnect take effect immediately, separately from staged defaults. Closing Options cancels
an unfinished sign-in. Authentication stays in the user's browser; the property sheet shows status,
device codes, and an optional callback-URL fallback, never saved credentials.

New conversation retains the old chat in History and asks only before discarding an unsent draft.
Default keyboard focus goes to Cancel. History is a searchable dialog with dated entries and
explicit deletion confirmation. Switching chats preserves their drafts for this app run.
Return focus to the composer after dialogs close. The cat’s model button opens a small dialog
with the same immediate selectors as the chat window. The selector is labeled This chat;
Models & sign-in opens Options on Models, where defaults and immediate account actions are
explicitly distinguished. Use this chat's settings stages a copy of the current selection.
Set up voice in chat opens Options on Voice when voice is disabled or a model is missing;
otherwise Voice options remains beside Talk. Reviewed 2026-09-19 against
[model controls](../src/renderer/src/ModelPicker.tsx), [model options](../src/renderer/src/ModelOptions.tsx),
and [voice controls](../src/renderer/src/voice/VoiceControls.tsx).

The chat starts at 720 × 560 and remains usable at 500 × 420. Options uses a wider property
sheet with a short introduction per tab, a fixed caption and action area, and independently
scrolling content. Unsaved tabs have a dot and an accessible description; the footer reports
pending changes and successful saves. The cat preview reflects staged size and animation.
Reviewed 2026-09-19 against [Options](../src/renderer/src/OptionsDialog.tsx) and
[styles](../src/renderer/src/style.css). Tab navigation follows the
[WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), including focusable content panels.
Keep all controls reachable by keyboard and respect the operating system's reduced-motion
preference. Preserve transparent pixels around the desktop pet at every size.

In the full chat window, voice controls sit immediately above the composer. Talk changes to
Finish recording and Cancel recording; a persistent Listening label appears on both chat
and the pet even when pet controls hide. Concurrent edits keep transcripts in an editable
Insert/Discard panel. Voice settings use staged Apply/OK/Cancel. Speech-model selection and its
explicit immediate Download/Remove actions come first, followed by enabling voice and language.
Microphone and performance controls expand on demand. Downloads show model name and progress;
a saved microphone remains selected even before devices are listed. The panel scrolls within
the property sheet. Reviewed 2026-09-19 against [voice options](../src/renderer/src/voice/VoiceOptions.tsx).
See [voice controls](../src/renderer/src/voice/VoiceControls.tsx) and
[smoke coverage](../tests/smoke/voice.spec.ts).

Talk on the desktop cat opens an XP panel with a blue caption and cream frame above the original artwork, keeping
chat hidden and the cat's size/foot position stable except when fitting the display work area.
Finish and Cancel stay visible throughout capture; focus loss does not hide the balloon.
Periodic, provisional transcript previews replace the waiting copy as recognition finishes.
Finish releases the microphone and produces an editable message; only Send submits it.
The conversation takes most of the balloon: a small caption, a scrolling reading pane and a
single-line input that grows only as needed. Keep New chat visible in the caption, with its
small document-plus icon. Actions (⋯), expand and close share that caption; the composer has one
contextual microphone/send/stop icon. Hide the duplicate controls below the cat while the panel
is open. History, Copy reply, full chat, model selection and voice settings live in the actions menu. Ctrl+N starts a new chat; Enter sends and Shift+Enter adds a line.
Tool activity collapses to one named status line with failures; expand it to inspect the steps.
Each step has a colored 16-pixel icon for its tool family and a separate labeled state.
The summary shows the active tool, step count, failures and stopped work; reduced motion
disables the running dot's pulse. Both chat views share this presentation. Reviewed 2026-09-20
against [tool activity](../src/renderer/src/ToolActivity.tsx).
During capture, the live preview lives in the reading pane, with only status and finish/cancel
icons below it. Scrolling up pauses following streamed text; a floating Latest reply returns to
the end. The top-left corner grip and top/left edges resize the panel toward the available desktop,
keeping the cat's feet fixed. The grip is keyboard-focusable: arrows resize by 10 DIP, Shift+arrows
by 40 DIP. Bound resizing to a useful minimum and the current display work area. Escape, focus loss,
closing, hiding and display changes end a gesture; late movement must not resize anything.
Keep the selected panel size across close/reopen during the app run, independently of pet size.
Expand/compact remains a quick preset. Copy reply copies the complete latest answer.
Close cancels capture but keeps an already reviewed draft
in that renderer until the app exits. Chat and cat retain separate drafts for each conversation.
Installed weights prepare in the background when enabled; first-run downloads remain explicit.
Ctrl+Alt+Space and the tray Talk action start or finish a recording. Existing drafts reopen for
review. The cat retains a clickable Reply ready indicator for unseen completions. Reviewed
2026-09-19 against [the panel](../src/renderer/src/voice/PetVoice.tsx) and desktop smoke coverage.

## References

The [Harness guide](harness-guide.md) opens in the user's browser as an offline XP Help and
Support page. Keep its blue caption, cream toolbar, Tahoma text, inset navigation and orange
selection accent consistent with the app. Its map and examples explain behavior without
running tools; the catalog and extension pages expose technical detail deliberately. Opening
the guide preserves staged Options changes. Reviewed 2026-09-19.

- [Microsoft's Windows interface text guidance](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/bb246446(v=vs.85)) informs concise labels and restrained descriptions.
- [XP.css's control reference](https://botoxparty.github.io/XP.css/) informs XP control proportions
  and visual states. The app uses its own styles and does not add a theme dependency.
- The useful lesson from Notion, Spotify, and Robinhood is clarity of purpose and predictable
  interaction. Computer Cat expresses that through XP's existing desktop conventions.

## Verification

Inspect real Electron screenshots of the empty window, conversation, all Options tabs,
confirmation dialog, transparent pet, and minimum-size layout. Test composing, cancellation,
window controls, staged preferences, persistence, save failure and retry, and keyboard focus.
Run `npm run verify` and `npm run test:smoke`; all model tests remain offline.
