import { useEffect, useRef } from "react";
import type { ChatSnapshot } from "../../../shared/contracts";
import { type VoiceSnapshot, voiceMessages } from "../../../shared/voice";
import { MarkdownMessage } from "../MarkdownMessage";
import { voiceStatus } from "./VoiceControls";

export function PetVoice({
  state,
  chat,
  text,
  setText,
  review,
  setReview,
  send,
  sending,
  error,
  close,
  start,
  options,
}: {
  state: VoiceSnapshot;
  chat: ChatSnapshot;
  text: string;
  setText: (text: string) => void;
  review: string;
  setReview: (text: string) => void;
  send: () => void;
  sending: boolean;
  error: string;
  close: () => void;
  start: () => void;
  options: () => void;
}) {
  const busy = !["idle", "review"].includes(state.phase);
  const input = useRef<HTMLTextAreaElement>(null);
  const reply = chat.messages.findLast((message) => message.role === "assistant");
  const hasText = !!text;
  useEffect(() => {
    if (hasText && !busy) input.current?.focus();
  }, [busy, hasText]);
  const setup = state.availability === "disabled" || state.availability === "model-missing";
  return (
    <section className="pet-voice" aria-label="Talk to Computer Cat">
      <div className="pet-voice-heading">
        <strong>
          {state.phase === "recording"
            ? "I'm listening"
            : busy
              ? "One moment…"
              : text || review
                ? "Your message"
                : "Computer Cat"}
        </strong>
        <button type="button" className="xp-button" aria-label="Close voice bubble" onClick={close}>
          ×
        </button>
      </div>
      <div className="pet-voice-content">
        {busy ? (
          <>
            <div className="pet-voice-transcript" aria-live="polite">
              {state.partial ||
                (state.phase === "recording"
                  ? "Go ahead, I'm listening…"
                  : "Getting your words ready…")}
            </div>
            <p className={state.phase === "recording" ? "listening" : ""} role="status">
              {voiceStatus(state)}
            </p>
          </>
        ) : text || review ? (
          <>
            <label htmlFor="pet-voice-draft">Review, then send</label>
            <textarea
              ref={input}
              id="pet-voice-draft"
              rows={3}
              maxLength={6000}
              value={review || text}
              onChange={(event) =>
                review ? setReview(event.target.value) : setText(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  !review
                ) {
                  event.preventDefault();
                  if (!sending && text.trim()) send();
                }
              }}
            />
          </>
        ) : chat.busy || reply ? (
          <div className="pet-voice-reply" aria-live="polite">
            {reply?.text ? <MarkdownMessage text={reply.text} /> : "Thinking…"}
          </div>
        ) : (
          <p>{setup ? "Set up local voice input to talk to your cat." : "Ready when you are."}</p>
        )}
        {(error || state.error) && (
          <p role="alert" className="pet-voice-error">
            {error || (state.error && voiceMessages[state.error])}
          </p>
        )}
      </div>
      <div className="pet-voice-actions">
        {busy ? (
          <>
            <button
              type="button"
              className="xp-button primary"
              disabled={state.phase !== "recording" || state.owner !== "pet"}
              title={state.owner === "chat" ? "Finish in the chat window" : undefined}
              onClick={() =>
                state.sessionId &&
                void window.computerCat.voiceRequestFinish({ sessionId: state.sessionId })
              }
            >
              Finish recording
            </button>
            <button
              type="button"
              className="xp-button"
              onClick={() =>
                state.sessionId &&
                void window.computerCat.voiceCancel({ sessionId: state.sessionId })
              }
            >
              Cancel recording
            </button>
          </>
        ) : chat.busy ? (
          <button
            type="button"
            className="xp-button"
            onClick={() => void window.computerCat.stop()}
          >
            Stop reply
          </button>
        ) : text || review ? (
          <>
            {review ? (
              <button
                type="button"
                className="xp-button primary"
                disabled={(text ? `${text.trimEnd()} ${review}` : review).length > 6000}
                onClick={() => {
                  setText(text ? `${text.trimEnd()} ${review}` : review);
                  setReview("");
                }}
              >
                Insert transcript
              </button>
            ) : (
              <button
                type="button"
                className="xp-button primary"
                disabled={sending || !text.trim()}
                onClick={send}
              >
                Send message
              </button>
            )}
            <button
              type="button"
              className="xp-button"
              disabled={sending}
              onClick={() => {
                if (review) setReview("");
                else setText("");
              }}
            >
              Discard
            </button>
          </>
        ) : (
          <button type="button" className="xp-button primary" onClick={setup ? options : start}>
            {setup ? "Set up voice…" : "Talk again"}
          </button>
        )}
      </div>
    </section>
  );
}
