# Whisper boundary contracts

Reviewed: 2026-09-18. These contracts guide the implemented
[local Whisper input](README.md). See the actual [preload API](../../../src/shared/voice.ts)
and [evidence](native-evidence.md). CUDA is unsupported in this CPU-only distribution.
Implement schemas and boundary tests with each slice; keep the named operations narrow.

## Shared limits and state

Use one app-wide voice controller, one capture session, and one native inference job at a time.
All IDs below are UUIDs allocated by main except normal typed-message IDs, whose existing
contract stays unchanged. The renderer never selects a filesystem path, download URL, native
argument, process ID, or model-provider credential.

| Limit | Initial value | Behavior at limit |
| --- | --- | --- |
| Capture format | Mono PCM16LE, 16,000 samples/sec | Reject any other format at the IPC boundary |
| Chunk target / maximum | 250 ms / 500 ms (8,000 / 16,000 bytes) | Reject empty, odd-sized, or oversized chunks |
| Capture duration / total | 120 seconds / 3,840,000 bytes | Finish at the timer if healthy; reject excess bytes |
| Minimum utterance | 300 ms / 9,600 bytes | Return too-short without inference |
| Capture startup deadline | 15 seconds after grant | Revoke grant, stop any late stream |
| Capture heartbeat | At least one chunk every 2 seconds | Cancel an unhealthy graph even when audio is silent |
| Finish/flush deadline | 2 seconds after main requests capture stop | Cancel and discard if tracks/chunks do not settle |
| Queue | At most four unacknowledged chunks | Abort visibly on overrun; never drop samples silently |
| Helper startup / model load | 60 seconds | Cancel loading, terminate if needed, keep typed chat usable |
| Transcription deadline | 120 seconds after final audio received | Abort, then enforce shutdown deadline |
| Stop cleanup | UI acknowledgment immediately; graph cleanup target 250 ms; helper deadline 2 seconds | Revoke session first; terminate hung inference |
| Transcript | 6,000 UTF-16 code units, matching existing Send | Return text-too-long; never silently truncate or submit |
| Native result envelope | At most 64 KiB; text field at most 24 KiB UTF-8 | Validate code-unit limit after decode too |
| Idle warm helper | Five minutes | Unload without changing saved model selection |

These are initial bounded product settings, not measured performance guarantees. The 120-second
capture timer runs in main; renderer time/duration claims are not authority. Main also checks
bytes against elapsed capture time with up to one second of scheduling tolerance. A silent
audio graph still emits zero samples. Rate/sequence violations invalidate the session and
release its buffers. Tune tolerances from tests without removing total bounds.

Keep availability separate from an utterance state:

```text
Availability: disabled | model-missing | preparing | ready | unavailable
Session:      idle -> starting -> recording -> finalizing -> transcribing -> review -> idle
Any active session -> cancelling -> idle
Failures carry a typed error and recovery action; no stuck permanent busy state.
```

A snapshot has a monotonic revision, availability, sanitized engine/backend/model status,
optional session ID and conversation ID, phase, elapsed time, and a typed error. The chat-only
snapshot may include a pending transcript. Pet snapshots contain status only. Track download
progress separately so a download cannot falsely appear as listening or agent activity.

## Renderer to main API

Extend `ComputerCatAPI` and `IPC` in the existing [contracts](../../../src/shared/contracts.ts),
then expose only named wrappers in [preload](../../../src/preload/index.ts). Reject unknown
properties with strict schemas. Main checks exact registered webContents, main frame, URL,
role, session ownership and current state for every call, even if UI controls are disabled.

| Proposed operation | Request | Allowed sender and effect |
| --- | --- | --- |
| `voiceSnapshot()` | None | Chat gets settings/pending result; pet gets status-only projection |
| `voiceStart()` | None | Chat or pet; main binds active conversation, ensures readiness, opens chat, issues grant |
| `voiceCaptureStarted()` | `{ sessionId }` | Chat capture owner; acknowledges live graph, transitions to recording |
| `voiceAppend()` | `{ sessionId, sequence, pcm }` | Chat owner; sequence starts at zero, `pcm` is copied/validated Uint8Array; acknowledges next sequence |
| `voiceRequestFinish()` | `{ sessionId }` | Chat only; main enters finalizing, starts flush deadline and requests track stop |
| `voiceFinish()` | `{ sessionId, nextSequence }` | Chat owner after stopping tracks and flushing acknowledged chunks; transitions once to transcription |
| `voiceCancel()` | `{ sessionId }` | Chat or pet; invalidates the matching active session, discards buffers; idempotent |
| `voiceCaptureFailed()` | `{ sessionId, code }` | Chat owner; bounded microphone/capture error enum, no browser error stack |
| `voiceCaptureReleased()` | `{ sessionId }` | Chat owner; acknowledges every track/graph closed; valid for cleanup of a revoked session, never changes a newer session |
| `voiceResultConsumed()` | `{ sessionId }` | Chat only, after transfer to its composer or pending review panel; idempotent |
| `voiceUpdateSettings()` | Complete versioned settings object | Chat only; validates atomic save and live-state constraints |
| `voiceDownloadModel()` | `{ modelId }` | Chat only; fixed catalogue lookup, returns main-issued download ID |
| `voiceCancelDownload()` | `{ downloadId }` | Chat only; discard partial asset, preserve installed valid copy |
| `voiceRemoveModel()` | `{ modelId }` | Chat only; reject assets in use, unload idle model before deleting its exact asset |

Settings: `version: 1`, `enabled`, `modelId` from the supported catalogue, `language` from a
bounded supported set (`en` or `auto` for the initial UI), `backend: auto | cpu | cuda`, and
optional local `inputDeviceId` (bounded to 512 characters). Missing/corrupt settings default
to disabled with a recoverable notice. They must not modify pet/model connection settings.
Explicit `cuda` selection fails visibly if unavailable; only `auto` falls back to CPU.

Main-to-renderer event subscriptions:

- `onVoiceChanged`: role-specific snapshot; revision guards reject older events.
- `onVoiceCaptureRequested`: chat-only `{ sessionId, conversationId, inputDeviceId? }`; client
  records its draft revision before opening the microphone. Duplicate session events do not
  create multiple streams. Re-check session validity when async microphone acquisition resolves.
- `onVoiceCaptureStopped`: chat-only `{ sessionId, reason }`; close tracks/graph and discard
  queues on cancel. A finish/duration-limit reason flushes a healthy recording instead.

The main duration timer uses the same finalizing transition as `voiceRequestFinish`. Permit
only the bounded queued tail in finalizing, within remaining total-byte and flush-time limits.
Require `voiceCaptureReleased` and the final acknowledged sequence before recognition starts.
A capture timeout must never create an indefinitely waiting finalization state.

Subscribe before requesting a snapshot. Reconcile the snapshot with incoming revisions so
startup races cannot lose a result. Unsubscribe and stop tracks on component disposal. Only
one capture controller is mounted, in chat; React development effect replay must not duplicate it.
An unknown/stale session cannot cancel a newer one or deliver text into it.

## Microphone permission policy

The current [main process](../../../src/main/index.ts) denies all permission requests/checks.
Replace that blanket handler with a narrowly tested policy for a main-issued, short-lived
capture grant. Use both Electron permission check and request handlers.

Permit only audio input, only for the registered chat webContents and its exact trusted
main-frame URL, and only in the starting/recording state for its current session. Reject
unregistered/destroyed contents, null contents, subframes, wrong URLs, pet requests, video,
screen capture, and unrelated permission types. Inspect the actual pinned Electron 44.4.1
declarations: request details use optional `mediaTypes`; check details use optional
`mediaType: audio | video | unknown`, `requestingUrl`, and `isMainFrame`. Missing/ambiguous
media information must not be treated as approval for camera.
Test both dev HTTP and packaged file URLs; an origin such as `file://` alone is insufficient.

Revoking the grant stops future permission grants, but does not terminate an already-open
MediaStream. The renderer must call `stop()` on every track, disconnect nodes, close its
AudioContext, and clear buffers on every terminal path, including delayed `getUserMedia`
resolution after cancellation. If the capture owner does not acknowledge cleanup within the
bound, main must terminate/recreate that specific capture webContents to end device use.
Preserve drafts before this escalation where possible; do not claim stopped solely because
a UI flag changed. Verify cleanup with fake tracks and a real Windows microphone indicator.

Electron handler behavior is documented in its
[session API](https://www.electronjs.org/docs/latest/api/session#setpermissionrequesthandlerhandler).
OS microphone denial is a separate recoverable error; never keep retrying automatically.
No permission is granted on boot, setting enable, model download, or model warm-up alone.

## Result delivery and chat races

Capture and result IDs are independent of agent request IDs. Voice never invokes
`AgentRuntime.run`; only the existing Send flow submits reviewed text.

1. `voiceStart` atomically checks there is no active agent turn/history change/voice session.
   Main assigns a session and conversation ID. The receiving chat saves its draft revision.
2. `voiceFinish` accepts the terminal sequence only after all append acknowledgments. Main
   closes capture authorization, invokes recognition once, and holds a cancellable job token.
3. Completion is accepted only for the current session, job token, and originating conversation.
   Validate text, normalize leading/trailing whitespace, preserve words/negations/numbers,
   and publish a chat-only review result. Do not run an LLM cleanup pass.
4. Chat consumes that result at most once. Append to the composer only if the draft revision
   still matches; otherwise use the pending review panel. If combined text exceeds 6,000
   characters, keep it in review for editing rather than clipping it.
5. Acknowledge only after the renderer owns the text. Main discards its duplicate. Pending
   results do not persist to disk. Page reload before acknowledgment can recover from the
   snapshot; reload after acknowledgment has the same draft-loss limitation as typed drafts.

Apply cancel-before-transition at the privileged boundary for New/Open/Delete conversation,
direct model selection, changed defaults on an empty chat, disconnect, dialogs that interrupt
capture, and app shutdown. Clear a main-held result when its conversation is removed. Keep
renderer-held pending review text with its conversation's in-memory drafts when switching.
Do not attach old results to whatever conversation happens to be active later.

Introduce a small main-owned coordination gate used by both voice starts and existing send/
history/model handlers. Checking `ChatSnapshot.busy` once before an `await` is not sufficient:
reserve the operation before awaiting, then recheck session/conversation identity. Reject Send
while starting/recording/finalizing/transcribing; allow it once text is an ordinary review draft.

## Helper wire protocol v1

The helper is not `whisper-cli` and must not pretend that upstream implements this protocol.
It is a new thin executable over the pinned C API, owned and tested by Computer Cat.

Each frame on stdin/stdout is:

```text
uint32_le jsonByteLength | UTF-8 JSON object | uint32_le payloadByteLength | raw payload bytes
```

Control JSON is limited to 32 KiB on input, 64 KiB on output. Payload is allowed only on
`transcribe` input and capped at 3,840,000 bytes; output payloads must be zero. Check lengths
before allocating. Process partial reads and concatenated frames; reject invalid UTF-8,
unknown versions/kinds/properties, duplicate keys, trailing garbage and inconsistent byte/sample
counts. Bound stderr to a 32 KiB diagnostic ring, sanitize errors, and never forward raw
stderr to the UI or saved logs. All stdout belongs to framing, with library logging redirected.

| Direction | Message kind | Fields beyond `version: 1` and `kind` |
| --- | --- | --- |
| Helper to main | `hello` | Helper build ID, pinned engine version, supported backend, protocol version |
| Main to helper | `load` | `requestId`, model ID, app-resolved model/VAD paths, backend, bounded thread count |
| Helper to main | `ready` | `requestId`, actual backend, model ID, load duration |
| Main to helper | `transcribe` | `requestId`, language, `sampleRate: 16000`, `sampleCount`; binary PCM payload |
| Main to helper | `cancel` | Active `requestId`; idempotent, observed by input thread |
| Helper to main | `result` | `requestId`, text, detected language, audio/inference durations |
| Helper to main | `no-speech` / `cancelled` | `requestId` |
| Helper to main | `error` | `requestId` when available, bounded code; no raw paths/text |
| Main to helper | `shutdown` | No active request required; abort and exit |

Main selects the expected binary/backend, so a mismatched hello is an error. For `ready`, main
supplies/binds the model ID in `load` alongside its paths and verifies it on response. Exactly
one terminal response per request is accepted. Unexpected IDs, malformed output, early exit,
excess output, or a timeout fail the job and recycle the helper. No result after cancellation
is usable even if inference finished concurrently.

Reading the control stream must remain possible during model loading/inference. An atomic
cancel flag feeds the upstream abort hooks; an input-thread shutdown/EOF marks the helper
closing. Model loading may not honor those hooks, so main's two-second kill deadline applies
there too. Main must wait for process exit before starting a replacement against the same
session. Parent death/pipe EOF must terminate the helper rather than leave GPU work orphaned.

## Model store contract

Keep executable builds under packaged resources, and downloaded weights under an app-owned
`userData/voice/models/<catalogue-id>/` directory. Do not use arbitrary user paths or discover
models in the Desktop. Store voice settings separately as `userData/voice.json`.

Every catalogue entry must supply an opaque ID, model family/format, immutable revision URL,
exact filename/bytes/SHA-256, language capabilities, required VAD artifact, source/license
links, and engine compatibility. A revision without reviewed real hashes is not installable.
The repo's planning docs are not a runtime download catalogue.

Downloads use an injected main-process client, HTTPS, bounded redirects restricted to
reviewed distribution hosts, no credentials, byte/time limits, cancellation, and SHA-256
verification. Treat CDN redirect hosts as reviewed catalogue configuration rather than
accepting arbitrary redirect destinations. Write an app-owned `.partial`, verify, then atomically
rename on the same volume. Partial/corrupt/wrong-length files never become ready. Preserve
an existing valid copy if replacement fails. Restart interrupted downloads from zero initially.

Disk preflight is advisory; still handle disk-full/access-denied at every write. Serialize
asset download/delete/load so deletion cannot race a model initialization. Cleanup only
verified paths beneath the exact app-owned model root, never traverse a junction/symlink to
another directory. Reverify installed assets before first load each app run, with cancellable
progress for large files. No runtime engine downloads or automatic version upgrades.

## Error vocabulary

Use a bounded code enum and app-authored recovery copy: `disabled`, `busy`, `model-missing`,
`download-failed`, `integrity-failed`, `disk-full`, `permission-denied`, `device-missing`,
`device-busy`, `capture-failed`, `capture-overrun`, `too-short`, `no-speech`, `backend-unavailable`,
`model-load-failed`, `helper-crashed`, `protocol-error`, `transcription-timeout`, `text-too-long`,
and `cancelled`. Unknown native/browser errors map to a generic code, not their raw message.
Cancellation is normal flow. Every error releases busy state and leaves typed chat usable.
