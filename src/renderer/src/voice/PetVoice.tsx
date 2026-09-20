/* biome-ignore-all lint/a11y/noNoninteractiveTabindex: The conversation region needs keyboard scrolling. */
import { useEffect, useRef, useState } from "react";
import type { ChatSnapshot } from "../../../shared/contracts";
import { type VoiceSnapshot, voiceMessages } from "../../../shared/voice";
import { MarkdownMessage } from "../MarkdownMessage";
import { TOOL_LABELS, ToolActivity } from "../ToolActivity";
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
  expanded,
  expand,
  openChat,
  newChat,
  history,
  clearing,
  ready,
  confirmClear,
  cancelClear,
  clear,
  modelLabel,
  openModels,
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
  expanded: boolean;
  expand: () => void;
  openChat: () => void;
  newChat: () => void;
  history: () => void;
  clearing: boolean;
  ready: boolean;
  confirmClear: boolean;
  cancelClear: () => void;
  clear: () => void;
  modelLabel: string;
  openModels: () => void;
}) {
  const busy = !["idle", "review"].includes(state.phase);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLElement>(null);
  const follow = useRef(true);
  const [behind, setBehind] = useState(false);
  const [copied, setCopied] = useState("");
  const [localError, setLocalError] = useState("");
  const last = chat.messages.at(-1);
  const reply = chat.messages.findLast((message) => message.role === "assistant");
  const running = reply?.tools?.findLast((tool) => tool.state === "running");
  const setup = state.availability === "disabled" || state.availability === "model-missing";
  const disabled = busy || chat.busy || sending || clearing || !ready;
  const conversationId = chat.conversationId;
  useEffect(() => {
    if (conversationId) {
      follow.current = true;
      setBehind(false);
      setCopied("");
    }
  }, [conversationId]);
  const lastText = last?.text;
  const lastId = last?.id;
  const toolState = last?.tools?.map((tool) => `${tool.id}:${tool.state}`).join(",");
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (lastId || lastText || toolState) {
      if (follow.current) element.scrollTop = element.scrollHeight;
      else setBehind(true);
    }
  }, [lastId, lastText, toolState]);
  useEffect(() => {
    if (!busy && !confirmClear && conversationId) input.current?.focus();
  }, [busy, confirmClear, conversationId]);
  async function voiceAction(task: Promise<{ ok: boolean; code?: keyof typeof voiceMessages }>) {
    setLocalError("");
    try {
      const result = await task;
      if (!result.ok) setLocalError(result.code ? voiceMessages[result.code] : "Try again.");
    } catch {
      setLocalError("Couldn't update voice input. Try again.");
    }
  }
  return (
    <section
      className={`pet-voice ${expanded ? "expanded" : ""}`}
      aria-label="Talk to Computer Cat"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.stopPropagation();
          confirmClear ? cancelClear() : close();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n" && !disabled) {
          event.preventDefault();
          newChat();
        }
      }}
    >
      <div className="pet-voice-heading">
        <strong title={chat.title}>{chat.title || "Computer Cat"}</strong>
        <div className="pet-caption-actions">
          <button
            type="button"
            className="xp-button"
            onClick={expand}
            aria-label={expanded ? "Compact cat panel" : "Expand cat panel"}
            title={expanded ? "Compact view" : "More room to read"}
          >
            {expanded ? "−" : "□"}
          </button>
          <button
            type="button"
            className="xp-button"
            onClick={openChat}
            aria-label="Open chat window"
            title="Open full chat window"
          >
            ↗
          </button>
          <button
            type="button"
            className="xp-button"
            aria-label="Close voice bubble"
            title="Close panel (Escape); keep your draft"
            onClick={close}
          >
            ×
          </button>
        </div>
      </div>
      <div className="pet-panel-toolbar">
        <button
          type="button"
          className="xp-button"
          onClick={newChat}
          disabled={disabled}
          title="New conversation (Ctrl+N)"
        >
          New chat
        </button>
        <button type="button" className="xp-button" onClick={history} disabled={disabled}>
          History…
        </button>
        <button
          type="button"
          className="text-button pet-panel-model"
          onClick={openModels}
          disabled={disabled}
          title={`Change model: ${modelLabel}`}
        >
          {modelLabel} ▾
        </button>
      </div>
      {confirmClear ? (
        <div className="pet-new-confirm" role="alertdialog" aria-label="New conversation">
          <p>Discard this unsent draft and start a new chat? Your conversation stays in History.</p>
          <div className="pet-voice-actions">
            <button
              type="button"
              className="xp-button"
              onClick={cancelClear}
              disabled={clearing}
              ref={(button) => button?.focus()}
            >
              Cancel
            </button>
            <button type="button" className="xp-button" onClick={clear} disabled={clearing}>
              {clearing ? "Starting…" : "Start new chat"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <section
            className="pet-voice-content"
            ref={scroll}
            aria-label="Cat conversation"
            tabIndex={0}
            onScroll={() => {
              const element = scroll.current;
              if (!element) return;
              follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 45;
              if (follow.current) setBehind(false);
            }}
          >
            {chat.messages.length ? (
              chat.messages.map((message) => (
                <article
                  key={message.id}
                  className={`pet-message ${message.role}`}
                  data-state={message.state}
                >
                  <strong className="pet-speaker">
                    {message.role === "assistant" ? "Computer Cat" : "You"}
                  </strong>
                  {message.tools?.length ? <ToolActivity tools={message.tools} /> : null}
                  {message.role === "assistant" ? (
                    <div className="pet-voice-reply">
                      {message.text ? (
                        <MarkdownMessage text={message.text} />
                      ) : message.state === "streaming" ? (
                        "Thinking…"
                      ) : message.state === "stopped" ? (
                        "Reply stopped."
                      ) : (
                        "No reply received."
                      )}
                    </div>
                  ) : (
                    <p className="pet-user-message">{message.text}</p>
                  )}
                  {message.role === "assistant" && (
                    <div className="pet-message-actions">
                      {message.state === "stopped" && <small>Reply stopped</small>}
                      {message.state === "error" && (
                        <small className="danger">Reply interrupted. You can send again.</small>
                      )}
                      {message.text && message.state !== "streaming" && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            void navigator.clipboard.writeText(message.text).then(
                              () => setCopied(message.id),
                              () =>
                                setLocalError("Couldn't copy. Select the reply and press Ctrl+C."),
                            );
                          }}
                        >
                          {copied === message.id ? "Copied" : "Copy reply"}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))
            ) : (
              <div className="pet-empty">
                <strong>What can I help you with?</strong>
                <p>Type below or click Talk.</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setText("What is on my screen?");
                    input.current?.focus();
                  }}
                >
                  Ask about my screen
                </button>
              </div>
            )}
          </section>
          {behind && (
            <button
              type="button"
              className="xp-button pet-jump"
              onClick={() => {
                follow.current = true;
                setBehind(false);
                if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
              }}
            >
              Latest reply ↓
            </button>
          )}
          {busy ? (
            <div className="pet-recording">
              <p className={state.phase === "recording" ? "listening" : ""} role="status">
                {voiceStatus(state)}
              </p>
              <div className="pet-voice-transcript" aria-live="polite">
                {state.owner === "chat"
                  ? "Recording in the chat window."
                  : state.partial ||
                    (state.phase === "recording"
                      ? "Go ahead, I'm listening…"
                      : "Getting your words ready…")}
              </div>
              <div className="pet-voice-actions">
                <button
                  type="button"
                  className="xp-button primary"
                  disabled={state.phase !== "recording" || state.owner !== "pet"}
                  onClick={() =>
                    state.sessionId &&
                    void voiceAction(
                      window.computerCat.voiceRequestFinish({ sessionId: state.sessionId }),
                    )
                  }
                >
                  Finish recording
                </button>
                <button
                  type="button"
                  className="xp-button"
                  onClick={() =>
                    state.sessionId &&
                    void voiceAction(window.computerCat.voiceCancel({ sessionId: state.sessionId }))
                  }
                >
                  Cancel recording
                </button>
              </div>
            </div>
          ) : (
            <form
              className="pet-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (!disabled && text.trim() && !review) {
                  follow.current = true;
                  send();
                }
              }}
            >
              <label className="sr-only" htmlFor="pet-voice-draft">
                {review ? "Transcript to review" : "Message Computer Cat"}
              </label>
              <textarea
                ref={input}
                id="pet-voice-draft"
                rows={2}
                maxLength={6000}
                placeholder="Type a message…"
                value={review || text}
                onChange={(event) =>
                  review ? setReview(event.target.value) : setText(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (!disabled && text.trim() && !review) {
                      follow.current = true;
                      send();
                    }
                  }
                }}
              />
              <div className="pet-voice-actions">
                {review ? (
                  <>
                    <button
                      type="button"
                      className="xp-button primary"
                      disabled={
                        disabled || (text ? `${text.trimEnd()} ${review}` : review).length > 6000
                      }
                      onClick={() => {
                        setText(text ? `${text.trimEnd()} ${review}` : review);
                        setReview("");
                      }}
                    >
                      Insert transcript
                    </button>
                    <button type="button" className="xp-button" onClick={() => setReview("")}>
                      Discard
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="xp-button"
                      disabled={disabled}
                      onClick={setup ? options : start}
                    >
                      {setup ? "Set up voice…" : reply ? "Talk again" : "Talk"}
                    </button>
                    {text && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={sending || clearing}
                        onClick={() => setText("")}
                      >
                        Discard
                      </button>
                    )}
                    <span className="pet-input-hint">
                      {text.length > 5500 ? `${text.length} / 6,000` : "Enter to send"}
                    </span>
                    {chat.busy ? (
                      <button
                        type="button"
                        className="xp-button"
                        onClick={() =>
                          void voiceAction(window.computerCat.stop().then(() => ({ ok: true })))
                        }
                      >
                        Stop reply
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="xp-button default-button"
                        disabled={disabled || !text.trim()}
                        aria-label="Send message"
                      >
                        {sending ? "Sending…" : "Send"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </form>
          )}
        </>
      )}
      {(error || localError || state.error) && (
        <p role="alert" className="pet-voice-error">
          {error || localError || (state.error && voiceMessages[state.error])}
        </p>
      )}
      <div className="pet-panel-status">
        <span role="status">
          {busy
            ? ""
            : chat.busy
              ? running
                ? `${TOOL_LABELS[running.name]}…`
                : "Computer Cat is replying…"
              : voiceStatus(state) || (setup ? "Microphone not set up" : "Ready to talk")}
        </span>
        {!busy && (
          <button type="button" className="text-button" onClick={options}>
            Voice options
          </button>
        )}
      </div>
    </section>
  );
}
