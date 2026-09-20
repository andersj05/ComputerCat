import { useState } from "react";
import { type VoiceResult, type VoiceSnapshot, voiceMessages } from "../../../shared/voice";
export function voiceStatus(state: VoiceSnapshot): string {
  if (state.phase === "starting")
    return state.availability === "preparing" ? "Loading speech model…" : "Starting microphone…";
  if (state.phase === "recording") return `Listening · ${Math.floor(state.elapsedMs / 1000)}s`;
  if (state.phase === "finalizing") return "Finishing recording…";
  if (state.phase === "transcribing") return "Transcribing on this computer…";
  if (state.phase === "cancelling") return "Stopping microphone…";
  if (state.error) return voiceMessages[state.error];
  if (state.availability === "preparing") return "Preparing voice in the background…";
  if (state.availability === "unavailable") return "Voice needs to reload · click Talk to retry";
  return "";
}
export function VoiceControls({
  state,
  busy,
  agentBusy,
  review,
  onReview,
  onInsert,
  onOptions,
}: {
  state: VoiceSnapshot;
  busy: boolean;
  agentBusy: boolean;
  review: string;
  onReview: (value: string) => void;
  onInsert: () => void;
  onOptions: () => void;
}) {
  const [error, setError] = useState("");
  const needsSetup = state.availability === "disabled" || state.availability === "model-missing";
  async function run(task: Promise<VoiceResult>) {
    setError("");
    try {
      const r = await task;
      if (!r.ok) setError(voiceMessages[r.code]);
    } catch {
      setError("Voice input is unavailable. Try again.");
    }
  }
  return (
    <div className="voice-area">
      <div className="voice-controls">
        {!busy ? (
          <button
            type="button"
            className="xp-button"
            disabled={agentBusy}
            onClick={() => (needsSetup ? onOptions() : void run(window.computerCat.voiceStart()))}
          >
            {needsSetup ? "Set up voice…" : "Talk"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="xp-button"
              disabled={state.phase !== "recording" || state.owner === "pet"}
              title={state.owner === "pet" ? "Finish in the cat's speech bubble" : undefined}
              onClick={() =>
                state.sessionId &&
                void run(window.computerCat.voiceRequestFinish({ sessionId: state.sessionId }))
              }
            >
              Finish recording
            </button>
            <button
              type="button"
              className="xp-button"
              onClick={() =>
                state.sessionId &&
                void run(window.computerCat.voiceCancel({ sessionId: state.sessionId }))
              }
            >
              Cancel recording
            </button>
          </>
        )}
        <span role="status" className={state.phase === "recording" ? "listening" : ""}>
          {error ||
            voiceStatus(state) ||
            (needsSetup ? "Use your microphone to draft a message." : "")}
        </span>
        {!busy && !needsSetup && (
          <button type="button" className="text-button" onClick={onOptions}>
            Voice options…
          </button>
        )}
      </div>
      {review && (
        <div className="voice-review">
          <label htmlFor="voice-review-text">Transcript to review</label>
          <textarea
            id="voice-review-text"
            value={review}
            onChange={(e) => onReview(e.target.value)}
            rows={2}
          />
          <button type="button" className="xp-button" onClick={onInsert}>
            Insert
          </button>
          <button type="button" className="xp-button" onClick={() => onReview("")}>
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
