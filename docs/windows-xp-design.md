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
  Chat, Options, Stop during replies, and the model selector. Escape, window blur, or choosing
  an action hides the controls. Drag the body to move it; there is no separate grip.
  Keep the artwork size and position stable when controls appear.
- Animate the original artwork with planted boots, gentle breathing, head movement, and blinks.
  Thinking has a distinct pose and status indicator. Pause motion while dragging; disable it
  for reduced motion or when Animate cat is unchecked. Preview staged animation in Options.

## Controls and dialogs

Use the same blue caption, cream buttons, dotted keyboard focus, green checks, blue fieldset
legends, and orange selected-tab edge throughout. Caption buttons perform native window
operations through the typed preload bridge. Close hides chat while the desktop pet stays open.

Options is an XP property sheet with Desktop cat, Models, and General tabs. Stage changes until Apply
or OK. Cancel, Escape, and the dialog's close button discard unapplied changes. If saving fails,
keep the dialog and draft open, show the error there, and leave the running cat unchanged.
Models uses native select controls for the default connection, model, and reasoning. Saving a
default does not replace an existing conversation; New conversation applies it. Account sign-in
and Disconnect take effect immediately, separately from staged defaults. Closing Options cancels
an unfinished sign-in. Authentication stays in the user's browser; the property sheet shows status,
device codes, and an optional callback-URL fallback, never saved credentials.

New conversation retains the old chat in History and asks only before discarding an unsent draft.
Default keyboard focus goes to Cancel. History is a searchable dialog with dated entries and
explicit deletion confirmation. Switching chats preserves their drafts for this app run.
Return focus to the composer after dialogs close. The cat’s model button opens a small dialog
with the same immediate selectors as the chat window; Connections opens Options on Models.

The chat starts at 720 × 560 and remains usable at 500 × 420. Dialog tabs keep a stable height.
Keep all controls reachable by keyboard and respect the operating system's reduced-motion
preference. Preserve transparent pixels around the desktop pet at every size.

Planned voice controls and a Voice tab are defined in the
[Whisper implementation specification](implementation/whisper/README.md#ux-and-lifecycle).
They are not current UI capabilities; retain the conventions above when implementing them.

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
