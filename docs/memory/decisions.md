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
Discovery remains empty. D006 supersedes the original tool restriction.

Consequences: adding AGENTS.md or a memory document cannot make the desktop cat remember it.
The renderer cannot access files, provider credentials, or the SDK. A worker is crash isolation,
not a security sandbox. Evidence: [architecture](../architecture.md),
[Pi resource loader](../../src/agent/pi-runtime.ts),
[worker environment](../../src/agent/config.ts), [Pi tests](../../tests/unit/pi-runtime.test.ts).

## D003: Conversations are transient; preferences and connections persist

Status: superseded by D006 on 2026-09-17.

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
model when defaults change; the direct selector can change a current chat (D006). A failed
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

## D006: Enable Pi tools and retain resumable conversations

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
