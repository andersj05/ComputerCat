# Windows XP presentation

The transparent cat is the app's character. Keep its full silhouette and original proportions.
The surrounding interface follows XP's desktop conventions: a compact messenger window, a
Luna caption, Tahoma text, cream controls, inset white panes, and small colored toolbar icons.

## Layout and copy

- One conversation pane and one message box. No sidebar, dashboard cards, decorative scenery,
  hero headings, or repeated brand introductions.
- The toolbar contains New conversation, History, Options, and Desktop. A compact native
  model/reasoning row below it changes the current chat without resetting its context.
- Two plain starter links prepare editable drafts. They do not send anything automatically.
- Speaker names and text form a plain chat log. Streaming appears in the status bar; Stop stays
  next to the message box and is also available from the cat.
- One status bar reports activity and the current mode. Put details in Options instead of
  repeating them around the workspace.
- Use labels that identify an action or setting. Avoid slogans and descriptions of obvious UI.
- The desktop shows only the cat until clicked. Clicking toggles a silhouette glow and reveals
  Chat, Talk, Options, Stop during replies or recording, and the model selector. Escape, window blur, or choosing
  an action hides the controls. Drag the body to move it; there is no separate grip.
  Keep the artwork size and position stable when controls appear.
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

Options is an XP property sheet with Desktop cat, Models, Voice, and General tabs. Stage changes until Apply
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

Voice controls (reviewed 2026-09-18) sit immediately above the composer. Talk changes to
Finish recording and Cancel recording; a persistent Listening label appears on both chat
and the pet even when pet controls hide. Concurrent edits keep transcripts in an editable
Insert/Discard panel. Voice settings use staged Apply/OK/Cancel. Speech-model selection and its
explicit immediate Download/Remove actions come first, followed by enabling voice and language.
Microphone and performance controls expand on demand. Downloads show model name and progress;
a saved microphone remains selected even before devices are listed. The panel scrolls within
the property sheet. Reviewed 2026-09-19 against [voice options](../src/renderer/src/voice/VoiceOptions.tsx).
See [voice controls](../src/renderer/src/voice/VoiceControls.tsx) and
[smoke coverage](../tests/smoke/voice.spec.ts).

Talk on the desktop cat opens a cream speech balloon above the original artwork, keeping
chat hidden and the cat's size/foot position stable except when fitting the display work area.
Finish and Cancel stay visible throughout capture; focus loss does not hide the balloon.
Periodic, provisional transcript previews replace the waiting copy as recognition finishes.
Finish releases the microphone and produces an editable message; only Send submits it.
The reply stays in the balloon. Close cancels capture but keeps an already reviewed draft
in that renderer until the app exits. Chat and cat retain separate drafts for each conversation.
Installed weights prepare in the background when enabled; first-run downloads remain explicit.

## References

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
