# Durable decisions

Record a choice here when its reason is useful beyond one task. Keep IDs stable. New choices
include status, date, rationale, consequences, and evidence; supersede old entries explicitly.
The historical choices below were reconstructed from the cited sources on 2026-09-17.

## D001: Keep shared development memory in Git

Status: adopted in the project-memory setup, 2026-09-17.

Use a short root instruction file, linked topic documents, and task-specific handoffs. Client
adapters point to the same source. This makes knowledge portable, inspectable, and reviewable
without another service, paid retrieval, or a developer's private memory store. The repository
is small enough for targeted text search; a vector database would add synchronization and
retrieval failure modes without an established need.

Consequences: agents must maintain useful facts alongside changes. Different branches can
have different valid snapshots; use normal Git integration. The offline checker catches
structural drift, while factual freshness remains part of review. Personal auto-memory is
supplementary. See the [memory guide](README.md) and
[checker](../../scripts/check-memory.mjs).

## D002: Keep developer memory outside the product runtime

Status: existing boundary retained; reviewed 2026-09-17.

Computer Cat's Pi integration receives only application-controlled context, explicit
configuration, and its conversation. Loading developer instructions, global Pi resources,
or arbitrary files from a user's directory could change behavior and expose unrelated data.
Discovery remains empty. D007 supersedes the original tool restriction.

Consequences: adding AGENTS.md or a memory document cannot make the desktop cat remember it.
The renderer cannot access files, provider credentials, or the SDK. A worker is crash isolation,
not a security sandbox. Evidence: [architecture](../architecture.md),
[Pi resource loader](../../src/agent/pi-runtime.ts),
[worker environment](../../src/agent/config.ts), [Pi tests](../../tests/unit/pi-runtime.test.ts).

## D003: Conversations are transient; preferences and connections persist

Status: superseded by D007 on 2026-09-17.

Companion preferences, model defaults, and an encrypted Codex connection are saved. New
conversation creates a fresh runtime, and app restart does not restore chat. This keeps
conversation persistence separate from connection setup and personal preferences.

Consequences: do not describe preferences.json or this memory directory as user conversation
memory. Any future retained user context needs its own deletion, migration, and isolation
behavior. Evidence: [current persistence map](current-state.md),
[preferences store](../../src/main/preferences.ts),
[conversation reset](../../src/main/chat-controller.ts),
[desktop persistence tests](../../tests/smoke/desktop.spec.ts).

## D004: Preserve the compact XP companion design

Status: existing product direction retained; reviewed 2026-09-17.

The full transparent cat silhouette and a single compact messenger are the product's visual
direction. Options follows staged property-sheet behavior. These choices avoid repeatedly
redesigning the app around dashboards or oversized introductory content.

Consequences: use the [XP design guide](../windows-xp-design.md) as the maintained specification;
verify actual Electron windows, keyboard focus, transparent pixels, and save/cancel behavior.
Evidence: application baseline `f977044`, [renderer](../../src/renderer/src/App.tsx), and
[desktop tests](../../tests/smoke/desktop.spec.ts).

## D005: Own the Codex connection and keep the saved default separate from the active chat

Status: adopted for subscription integration, 2026-09-17.

Use the pinned Pi provider's Codex OAuth flow with an app-owned encrypted credential file.
Do not import or mutate global Codex/Pi logins. Electron safeStorage protects credentials;
unavailable secure storage must fail closed. Refresh tokens stay in the privileged process.
The renderer receives only connection status and model choices.

Save model defaults separately from pet preferences. Existing conversations keep their active
model when defaults change; the direct selector can change a current chat (D007). A failed
save leaves the old default intact. Credentials and
conversation text must never enter the model preferences file. Subscription availability is
determined by the provider and account, not guaranteed by the SDK's model catalogue.

Evidence: [model settings](../../src/main/model-settings.ts),
[encrypted store](../../src/main/secret-store.ts),
[persistence tests](../../tests/unit/secret-store.test.ts), and
[OpenAI authentication guidance](https://learn.chatgpt.com/docs/auth).
The [OAuth adapter](../../src/agent/codex-auth.ts) uses the pinned provider's browser/device
flows and serializes refresh with credential deletion. [Offline tests](../../tests/unit/codex-auth.test.ts)
intercept the real SDK's device flow and cover cancellation, stale callbacks, and rotated tokens.


## D006: Keep the companion reachable without taking keyboard focus

Status: adopted for desktop cat interaction, 2026-09-17.

Always on top uses Electron's screen-saver level with a two-second z-order recovery while the
pet is visible and the preference is enabled. Show, blur, resume, and unlock also reassert it.
Use showInactive/moveTop for recovery, never focus. Find cat brings it to the pointer's display.
The setting remains optional; secure desktops and exclusive fullscreen are outside this scope.

Dragging uses a pet-only phase bridge with main-owned cursor coordinates, a movement threshold,
work-area constraints, and cancellation. The original artwork gains independent head/body motion
and blinks rather than whole-image bouncing. Animation remains optional and respects reduced motion.

Evidence: [window lifecycle](../../src/main/index.ts), [drag rules](../../src/main/pet-window.ts),
[artwork](../../src/renderer/src/PetArtwork.tsx), [movement tests](../../tests/unit/pet-window.test.ts),
[desktop tests](../../tests/smoke/desktop.spec.ts), and
[Electron window levels](https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level-relativelevel).

## D007: Enable Pi tools and retain resumable conversations

Status: adopted at the user’s explicit request, 2026-09-17; supersedes D003 and the tool
restriction in D002. Enable all eight built-in Pi tools with OS user privileges and Desktop
working directory. Keep arbitrary extension/instruction discovery disabled and credentials
app-owned. The worker is crash isolation, not a filesystem or shell sandbox.

Persist versioned UI transcripts and native Pi context separately per UUID in app user data.
This preserves tool results when reopening a chat or changing models. History provides local
inspection and deletion; records remain until deleted. Unsent drafts stay in memory only.
Keep saved defaults separate from immediate per-conversation model selection.

Evidence: [Pi adapter](../../src/agent/pi-runtime.ts), [conversation store](../../src/main/conversation-store.ts),
[controller tests](../../tests/unit/conversation-controller.test.ts),
[Pi restoration tests](../../tests/unit/pi-runtime.test.ts), and [architecture](../architecture.md).

## D008: Distribute Computer Cat under MIT

Status: adopted at the owner's request; reviewed 2026-09-17.

The repository and package metadata use the MIT license, with the copyright holder matching
package.json. Packaged applications include the license in their resources directory.
The package stays private to prevent accidental npm publication; this does not restrict the
license granted in LICENSE. Dependencies retain their own licenses.

Evidence: [license](../../LICENSE), [package metadata](../../package.json),
[lockfile](../../package-lock.json), and [packaging](../../electron-builder.yml).

## D009: Use local Whisper for the first speech input

Status: implemented for Windows CPU; reviewed 2026-09-18. Supersedes the cloud-first input
proposal in [voice research](../voice-and-desktop-research.md). Release evaluation is incomplete.

Use Whisper `large-v3-turbo` through `whisper.cpp` for local transcription with no speech API
key or per-minute service charge. Keep existing Pi/Codex reasoning and authentication. The
reason is the user's choice of a free local input method after comparing speech options.

The [implementation](../implementation/whisper/README.md) uses a persistent, supervised
native helper, bounded session-owned microphone capture, explicit verified model downloads and
editable transcripts sent through the existing composer. whisper.cpp 1.9.4, weights and
Silero 6.2.0 are pinned by full revisions and verified SHA-256. The CPU build has a portable
fallback plus a CPUID/OS-guarded AVX2 variant: portable Turbo exceeded the inference deadline
in a local trial, while AVX2 completed. CPU is the actual backend in Auto. CUDA configuration
failed without a toolkit and is explicitly unsupported in this distribution. The tradeoff
preserves offline use without installing drivers or tools on end-user machines. See
[native evidence](../implementation/whisper/native-evidence.md); broad accuracy/latency and
clean-machine tests remain release gates.

Consequences: native Windows build/distribution and sizeable model downloads become project
responsibilities. Audio stays outside Pi and saved chat; sent text uses existing conversation
retention. Speech output and desktop control remain independent future scope; desktop observation is D011.
No automatic paid fallback or reuse of Codex OAuth for a speech API. See the
[contracts](../implementation/whisper/contracts.md) and [delivery gates](../implementation/whisper/delivery.md).

## D010: Keep desktop voice beside the cat

Status: adopted 2026-09-18. Supersedes the pet-to-chat routing in the initial Whisper plan.

The user's Talk gesture chooses the trusted capture window. Cat-origin voice stays in a
desktop conversation panel with provisional text, Finish/Cancel, a typed or dictated draft,
explicit Send, tool progress and expandable replies (reviewed 2026-09-19). This avoids the context switch into chat while preserving review
before the agent acts. Each renderer retains its own unsent drafts; only sent text is shared.
Previews serialize with final inference and never become an agent message automatically.

Reviewed 2026-09-19: prioritize message space over persistent controls. The cat panel uses one
contextual microphone/send/stop control, collapses tool details and puts secondary actions under
⋯. Keep New chat directly visible in the XP caption for quick access. Hide the dock while the panel is open. This addresses the crowded reading area without growing
the default window. Its top/left resize grip preserves the cat anchor and keeps the chosen size
for this app run. See [XP guidance](../windows-xp-design.md) and
[layout and keyboard checks](../../tests/smoke/desktop.spec.ts).

Installed, enabled weights preload on startup and after applying voice settings without a
microphone grant. Reviewed 2026-09-19: enabled models now stay resident by default for fast
repeat Talk; the Voice performance setting offers the former five-minute idle unload.
Cancelling capture without inference retains prepared weights, and chat transitions preserve
an in-flight preload. Lock/sleep frees weights and unlock/resume prepares them again. No automatic download, model replacement, cloud fallback
or always-listening mode is introduced. CPU recognition latency remains model-dependent.

Evidence: [controller](../../src/main/voice/controller.ts), [bubble](../../src/renderer/src/voice/PetVoice.tsx),
[boundary tests](../../tests/unit/voice-controller.test.ts) and [Electron checks](../../tests/smoke/voice.spec.ts).

## D011: Make desktop context explicit, read-only and on demand

Status: superseded by D012 on 2026-09-19. The first implementation required a visible,
memory-only sharing grant. The user explicitly rejected the Share screen workflow and
requested agent-selected tools that act directly on screen questions.

## D012: Let the agent choose desktop observations for user requests

Status: adopted and implemented, reviewed 2026-09-19. Supersedes D011's sharing grant/UI.

Expose `desktop_observe` alongside window listing, capture and text reading. For “this page,”
the harness finds the foreground app, or infers the app behind Computer Cat when the companion
has focus. Return the target reason, text, selection, tabs and image together; keep useful
partial results. Named windows use opaque IDs scoped to the current turn and sixty seconds.
This makes screen context part of the agent's normal tool loop without a separate user gesture.
Do not scan at startup or poll the desktop in the background.

Keep bounded private worker RPC, Stop/cancellation, lock/sleep blocking, and read-only Windows
accessibility. Unlock/resume restores availability automatically. The prompt treats desktop
content as untrusted and forbids protected-surface workarounds. Images/text follow the existing
model and local conversation retention policy. This is not an OS sandbox: file/shell tools
retain user privileges. D016 adds targeted input; complete background browser access remains future work.

Evidence: [desktop design](../desktop-context.md), [broker](../../src/main/desktop/controller.ts),
[Pi tools](../../src/agent/desktop-tools.ts), [prompt](../../src/agent/runtime.ts), and
[boundary tests](../../tests/unit/desktop-controller.test.ts).

## D013: Capture one source and keep focused context tools

Status: adopted and implemented, reviewed 2026-09-19. Refines D012 after real WGC error reports.

Use metadata-only listings and a short-lived isolated media renderer for one selected source.
Bulk thumbnails attempted unrelated uncapturable windows before JavaScript could filter them.
Do not globally hide Chromium errors or bypass protected sources. Cancel/deadline destroys
the media owner. Known capture failures are remembered for the reply, across source relisting;
the next turn can retry. Preserve readable text when an image fails.

Selection and tab tools skip full-page text collection and screenshots; region capture crops
before resizing for small details. Keep these read-only and within the same source/turn rules.
Evidence: [capture boundary](../../src/main/desktop/source-capture.ts),
[broker](../../src/main/desktop/controller.ts), [tool definitions](../../src/agent/desktop-tools.ts),
and [native verification](../../tests/smoke/native-capture.spec.ts).

## D014: Add narrow desktop utilities before general application control

Status: adopted and implemented, reviewed 2026-09-20.

Expose six named utilities through the existing turn-scoped desktop broker: current environment,
clipboard text read/write, open web link/folder and reveal file. Fixed native APIs replace shell
generation for these common jobs. No new dependencies or renderer OS access are needed.
Keep strict requests, bounded output, serialized dispatch and lock/sleep/cancellation handling.
Report OS dispatch separately from verified application state; after an uncertain outcome,
observe before retrying. Stop cannot undo an already dispatched OS action.

Clipboard task relevance is prompt policy; this does not create an enforced permission mode
around the existing privileged shell tools. No implicit clipboard fallback from failed selection
reading. Clipboard tool results follow existing local Pi retention and selected-model delivery.

Evidence: [research](../harness-improvements.md), [contract](../../src/shared/desktop-utilities.ts),
[service](../../src/main/desktop/utilities.ts), [tests](../../tests/unit/desktop-utilities.test.ts).
Public web research followed in D015 and targeted native input in D016. Full browser integration,
connectors and selected-fact memory remain proposals.

## D015: Keep public web research separate from browser sessions

Status: adopted and implemented, reviewed 2026-09-20.

Add explicit read, page, find and optional search tools through a private worker channel. Main
owns bounded public HTTP, validated/pinned DNS destinations and per-turn page snapshots. This
gives the cat source text and citations without depending on visible browser text or inheriting
browser cookies. Search uses only the explicitly configured Brave key in main; the worker's
environment excludes it. Reading known URLs needs no key. D016 adds visible browser control
through Windows accessibility; a full browser connection remains separate.

Each source reports URL, retrieval time and truncation. Stop and turn completion invalidate
cached references and suppress late results. Web work has a separate 20-call budget and does
not depend on desktop lock/sleep state. Citations can open in the default browser only through
an explicit click and validated HTTP/HTTPS dispatch; they never navigate the app renderer.
These restrictions govern the new tools, not the previously enabled privileged shell tools.

Evidence: [web design and sources](../web-research.md), [service](../../src/main/web/controller.ts),
[transport](../../src/main/web/public-http.ts), [link boundary](../../src/main/open-link.ts),
[unit checks](../../tests/unit/web-controller.test.ts) and [worker/UI checks](../../tests/smoke/codex.spec.ts).

## D016: Use consumed observations for targeted Windows input

Status: adopted and implemented, reviewed 2026-09-21.

Extend the existing serialized broker with inspect, click, fill, type, bounded key and scroll
tools. Prefer native accessibility patterns and exact control identities. Keep window/process,
geometry, field value and user-input checks in the native helper. Each action consumes its
observation, returning fresh state for verification. Never release input ownership before a
cancelled helper exits or silently retry uncertain input. Drafting does not authorize sending;
that intent rule is model policy, not a new sandbox for the existing privileged shell.

This uses Windows' built-in accessibility stack without adding an unpinned driver or requiring
browser profiles/debug ports. Coverage depends on each app; foreground denial and unsupported
controls remain explicit limitations. Arbitrary coordinates/canvas controls and DOM integration
are deferred. Native fixture results do not establish live-model reliability.

Evidence: [design and limits](../computer-use.md), [broker](../../src/main/desktop/computer-use.ts),
[tools](../../src/agent/computer-tools.ts), [Windows helper](../../src/main/desktop/windows-input.ts),
[native test](../../tests/smoke/computer-input.spec.ts), [browser test](../../tests/smoke/browser-input.spec.ts).
