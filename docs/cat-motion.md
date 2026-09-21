# Cat activity and motion

Reviewed: 2026-09-21. The original cat remains the character: transparent silhouette, original
proportions and planted boots. Motion gives the current task a recognizable pose, with quieter
idle behavior between tasks. It never opens a microphone or initiates model work.

| Activity | Trigger | Visual cue |
| --- | --- | --- |
| Idle | No active work | Breathing, curious glances, an occasional wink and paw fidget; hover greeting |
| Getting ready | Voice starting | Straightening up and a turning pixel hourglass |
| Listening | Voice recording, including provisional recognition | A listening lean and green signal marks |
| Transcribing | Voice finalizing or transcribing | Looking down, notebook and scribbling pencil |
| Review message | Voice review or an open cat draft | Holding the notebook patiently, with a check mark |
| Thinking | Busy before reply text, or switching conversations | Thoughtful head tilt and three hopping dots |
| Working | A tool in the active reply is running | Alternating paws at a tiny keyboard |
| Replying | Active streamed text with no running tool | Talking mouth, nods and a conversational paw gesture |
| All done | A newly completed reply | Happy eyes, a small wave and restrained sparkles for 2.4 seconds |
| Stopping | Voice cancellation in progress | Settling pose and pause symbol |
| Needs attention | Current UI, voice, storage or reply error | Puzzled tilt and question mark |

Signal marks are an activity symbol, not an audio-level meter. Replying animates text delivery;
the app has no speech playback or audio lip synchronization. Background model preparation alone
never makes the cat appear to listen. Cancellation is not a failure. A completed tool alone is
not a completed reply.

## State and accessibility

[Activity selection](../src/renderer/src/pet-activity.ts) uses typed snapshots, not localized
status strings. Active microphone phases take priority over old errors or chat output. Running
tools take priority over existing streamed text. Historical complete text cannot appear to speak
while a conversation is switching. Completion requires the same reply and conversation to move
from streaming to complete; failed, stopped, empty and restored replies do not celebrate.
[The completion hook](../src/renderer/src/usePetActivity.ts) clears its timer on unmount and
lets new activity interrupt the reaction immediately.

The pet's reserved status slot keeps concise activity text visible when controls are closed.
The voice balloon supplies its own detailed status while open. The button references an accessible
status description; decorative SVG content is hidden from assistive technology. Errors retain
their explanation in the status tooltip and screen-reader text.

Both Animate cat and `prefers-reduced-motion` disable all animation, including facial movement,
hover, props and sparkles. Static poses, props and text still communicate the activity. Dragging
and document hiding pause every SVG layer. There is no per-frame JavaScript, polling, animation
library, network resource or additional preference to synchronize.

## Rendering and preview

[PetArtwork](../src/renderer/src/PetArtwork.tsx) shares one local image between clipped layers.
Overlapping shoulders, a tapered warm-fur backing and a generous neck overlap cover cuts as paws
and head move. The backing samples orange shoulder fur so an inward paw does not expose a wide,
cream rectangle. Blinks use brief discrete closures; closed speech beats restore the original
mouth instead of compressing an overlaid mouth into a line. The boots never transform. Pixel
props use the same warm outline palette.
[Motion CSS](../src/renderer/src/pet-motion.css) owns each activity's static pose and animation.
Activity changes retain the SVG instead of restarting the whole rig on every streamed token.
The pet's grid column can shrink independently of its controls; compact small-size buttons
keep Talk and Stop inside the window without widening or shifting the artwork.

Options → Desktop cat previews every activity at the staged size and animation preference.
The selector is local preview state, not a saved setting or command to the live cat. Selection
does not dirty preferences, record audio, change the conversation or send anything.

Evidence: [activity boundary tests](../tests/unit/pet-activity.test.ts),
[desktop smoke coverage](../tests/smoke/desktop.spec.ts), and
[voice smoke coverage](../tests/smoke/voice.spec.ts). Inspect actual Electron screenshots at all
three sizes and representative animation phases; check motion-off modes, dragging, transparent
corners, stable layout, cancellation, new work interrupting completion and history restoration.
