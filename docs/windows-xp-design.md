# Windows XP presentation

The transparent cat is the app's character. Keep its full silhouette and original proportions.
The surrounding interface follows XP's desktop conventions: a compact messenger window, a
Luna caption, Tahoma text, cream controls, inset white panes, and small colored toolbar icons.

## Layout and copy

- One conversation pane and one message box. No sidebar, dashboard cards, decorative scenery,
  hero headings, or repeated brand introductions.
- The toolbar contains three working actions: New conversation, Options, and Desktop.
- Two plain starter links prepare editable drafts. They do not send anything automatically.
- Speaker names and text form a plain chat log. Streaming appears in the status bar; Stop stays
  next to the message box and is also available from the cat.
- One status bar reports activity and the current mode. Put details in Options instead of
  repeating them around the workspace.
- Use labels that identify an action or setting. Avoid slogans and descriptions of obvious UI.
- The desktop cat shows no idle caption. Click it to chat; drag its body or grip to move it.
  Keep Chat and Options buttons beneath it, with Stop alongside them during a reply.
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

New conversation asks before clearing messages or a draft. Default keyboard focus goes to
Cancel. Return focus to the composer after either dialog closes.

The chat starts at 720 × 560 and remains usable at 500 × 420. Dialog tabs keep a stable height.
Keep all controls reachable by keyboard and respect the operating system's reduced-motion
preference. Preserve transparent pixels around the desktop pet at every size.

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
