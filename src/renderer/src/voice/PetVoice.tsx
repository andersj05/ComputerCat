/* biome-ignore-all lint/a11y/noNoninteractiveTabindex: The conversation region needs keyboard scrolling. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatSnapshot } from "../../../shared/contracts";
import { type VoiceSnapshot, voiceMessages } from "../../../shared/voice";
import { Icon } from "../Icon";
import { MarkdownMessage } from "../MarkdownMessage";
import { ToolActivity } from "../ToolActivity";
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
  const menu = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [behind, setBehind] = useState(false);
  const [copied, setCopied] = useState("");
  const [localError, setLocalError] = useState("");
  const last = chat.messages.at(-1);
  const reply = chat.messages.findLast((message) => message.role === "assistant");
  const setup = state.availability === "disabled" || state.availability === "model-missing";
  const disabled = busy || chat.busy || sending || clearing || !ready;
  const conversationId = chat.conversationId;
  useEffect(() => {
    if (conversationId) {
      follow.current = true;
      setBehind(false);
      setCopied("");
      setMenuOpen(false);
    }
  }, [conversationId]);
  const lastText = last?.text;
  const lastId = last?.id;
  const toolState = last?.tools?.map((tool) => `${tool.id}:${tool.state}`).join(",");
  const partial = state.partial;
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (lastId || lastText || toolState || partial || busy) {
      if (follow.current) element.scrollTop = element.scrollHeight;
      else setBehind(true);
    }
  }, [lastId, lastText, toolState, partial, busy]);
  useEffect(() => {
    if (confirmClear) cancelButton.current?.focus();
    else if (!busy && conversationId) input.current?.focus();
  }, [busy, confirmClear, conversationId]);
  const draft = review || text;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Remeasure when content or panel width changes.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element || busy || confirmClear) return;
    // Reset before measuring so deleting lines also shrinks the composer.
    element.style.height = "32px";
    element.style.height = `${Math.min(84, Math.max(32, element.scrollHeight + 2))}px`;
  }, [draft, expanded, busy, confirmClear]);
  useEffect(() => {
    if (!menuOpen) return;
    menu.current?.querySelector<HTMLButtonElement>(".pet-menu-action:not(:disabled)")?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeMenu = () => setMenuOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("blur", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("blur", closeMenu);
    };
  }, [menuOpen]);
  function action(task: () => void) {
    setMenuOpen(false);
    task();
  }
  function talk() {
    setLocalError("");
    follow.current = true;
    setup ? options() : start();
  }
  async function voiceAction(task: Promise<{ ok: boolean; code?: keyof typeof voiceMessages }>) {
    setLocalError("");
    try {
      const result = await task;
      if (!result.ok) setLocalError(result.code ? voiceMessages[result.code] : "Try again.");
    } catch {
      setLocalError("Couldn't update voice input. Try again.");
    }
  }
  function submit() {
    if (!disabled && text.trim() && !review) {
      follow.current = true;
      send();
    }
  }
  return (
    <section
      className={`pet-voice ${expanded ? "expanded" : ""}`}
      aria-label="Talk to Computer Cat"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          event.stopPropagation();
          setMenuOpen(false);
          menuButton.current?.focus();
        } else if (event.key === "Escape" && !busy) {
          event.stopPropagation();
          confirmClear ? cancelClear() : close();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n" && !disabled) {
          event.preventDefault();
          action(newChat);
        }
      }}
    >
      <div className="pet-voice-heading">
        <strong title={chat.title}>{chat.title || "Computer Cat"}</strong>
        <div className="pet-caption-actions">
          <button
            type="button"
            className="xp-button pet-new-chat"
            onClick={() => action(newChat)}
            disabled={disabled || confirmClear}
            title="New chat (Ctrl+N)"
          >
            <Icon name="new" /> New chat
          </button>
          <div className="pet-menu" ref={menu}>
            <button
              type="button"
              className="pet-caption-control"
              ref={menuButton}
              aria-label="Conversation actions"
              aria-expanded={menuOpen}
              aria-controls="pet-conversation-actions"
              title="Conversation actions"
              onClick={() => setMenuOpen(!menuOpen)}
              disabled={confirmClear}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="pet-menu-actions" id="pet-conversation-actions">
                <button
                  type="button"
                  className="pet-menu-action"
                  disabled={disabled}
                  onClick={() => action(history)}
                >
                  History…
                </button>
                <button type="button" className="pet-menu-action" onClick={() => action(openChat)}>
                  Open chat window ↗
                </button>
                <button
                  type="button"
                  className="pet-menu-action pet-menu-divider"
                  disabled={!reply?.text || reply.state === "streaming"}
                  onClick={() => {
                    if (!reply) return;
                    setLocalError("");
                    void window.computerCat.copyReply(reply.id).then(
                      (result) => {
                        if (result.ok) setCopied(reply.id);
                        else setLocalError(result.message);
                      },
                      () => setLocalError("Couldn't copy. Select the reply and press Ctrl+C."),
                    );
                  }}
                >
                  {reply && copied === reply.id ? "Copied" : "Copy reply"}
                </button>
                <button
                  type="button"
                  className="pet-menu-action"
                  disabled={disabled}
                  onClick={() => action(talk)}
                >
                  {setup ? "Set up voice…" : "Dictate a message"}
                </button>
                <button
                  type="button"
                  className="pet-menu-action pet-menu-divider"
                  disabled={disabled}
                  onClick={() => action(openModels)}
                  title={modelLabel}
                >
                  Model: {modelLabel}…
                </button>
                <button type="button" className="pet-menu-action" onClick={() => action(options)}>
                  Voice options…
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="pet-caption-control"
            onClick={expand}
            aria-label={expanded ? "Compact cat panel" : "Expand cat panel"}
            title={expanded ? "Compact view" : "More room to read"}
          >
            {expanded ? "−" : "□"}
          </button>
          <button
            type="button"
            className="pet-caption-control pet-caption-close"
            aria-label="Close voice bubble"
            title="Close panel (Escape); keep your draft"
            onClick={close}
          >
            ×
          </button>
        </div>
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
              ref={cancelButton}
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
          <div className="pet-conversation">
            <section
              className="pet-voice-content"
              ref={scroll}
              aria-label="Cat conversation"
              tabIndex={0}
              onScroll={() => {
                const element = scroll.current;
                if (!element) return;
                follow.current =
                  element.scrollHeight - element.scrollTop - element.clientHeight < 45;
                if (follow.current) setBehind(false);
              }}
            >
              {chat.messages.map((message) => (
                <article
                  key={message.id}
                  className={`pet-message ${message.role}`}
                  data-state={message.state}
                >
                  <strong className="pet-speaker">
                    {message.role === "assistant" ? "Computer Cat" : "You"}
                  </strong>
                  {message.tools?.length ? <ToolActivity tools={message.tools} compact /> : null}
                  {message.role === "assistant" ? (
                    <div className="pet-voice-reply">
                      {message.text ? (
                        <MarkdownMessage text={message.text} />
                      ) : message.state === "streaming" ? (
                        message.tools?.some((tool) => tool.state === "running") ? null : (
                          "Thinking…"
                        )
                      ) : message.state === "stopped" ? (
                        "Reply stopped."
                      ) : (
                        "No reply received."
                      )}
                    </div>
                  ) : (
                    <p className="pet-user-message">{message.text}</p>
                  )}
                  {message.role === "assistant" && message.state === "stopped" && message.text && (
                    <small>Reply stopped</small>
                  )}
                  {message.role === "assistant" && message.state === "error" && (
                    <small className="danger">Reply interrupted. You can send again.</small>
                  )}
                </article>
              ))}
              {!chat.messages.length && !busy && (
                <p className="pet-empty">What can I help you with?</p>
              )}
              {busy && (
                <div className="pet-voice-transcript" aria-live="polite">
                  <strong className="pet-speaker">
                    {state.owner === "chat" ? "Recording in the chat window" : "You · voice draft"}
                  </strong>
                  {state.owner !== "chat" &&
                    (state.partial ||
                      (state.phase === "recording"
                        ? "Go ahead, I'm listening…"
                        : "Getting your words ready…"))}
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
          </div>
          {busy ? (
            <div className="pet-recording">
              <span className={state.phase === "recording" ? "listening" : ""} role="status">
                {voiceStatus(state)}
              </span>
              <button
                type="button"
                className="xp-button pet-input-action"
                aria-label="Finish recording"
                title="Finish recording"
                disabled={state.phase !== "recording" || state.owner !== "pet"}
                onClick={() =>
                  state.sessionId &&
                  void voiceAction(
                    window.computerCat.voiceRequestFinish({ sessionId: state.sessionId }),
                  )
                }
              >
                ✓
              </button>
              <button
                type="button"
                className="xp-button pet-input-action"
                aria-label="Cancel recording"
                title="Cancel recording"
                onClick={() =>
                  state.sessionId &&
                  void voiceAction(window.computerCat.voiceCancel({ sessionId: state.sessionId }))
                }
              >
                ×
              </button>
            </div>
          ) : (
            <form
              className={`pet-composer ${review ? "has-review" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label className="sr-only" htmlFor="pet-voice-draft">
                {review ? "Transcript to review" : "Message Computer Cat"}
              </label>
              <textarea
                ref={input}
                id="pet-voice-draft"
                rows={1}
                maxLength={6000}
                placeholder="Message…"
                title="Enter to send · Shift+Enter for a new line"
                value={draft}
                onChange={(event) =>
                  review ? setReview(event.target.value) : setText(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              {review ? (
                <div className="pet-voice-actions">
                  <button
                    type="button"
                    className="xp-button"
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
                </div>
              ) : chat.busy ? (
                <button
                  type="button"
                  className="xp-button pet-input-action"
                  aria-label="Stop reply"
                  title="Stop reply"
                  onClick={() =>
                    void voiceAction(window.computerCat.stop().then(() => ({ ok: true })))
                  }
                >
                  ■
                </button>
              ) : text.trim() ? (
                <button
                  type="submit"
                  className="xp-button pet-input-action"
                  disabled={disabled}
                  aria-label="Send message"
                  title="Send message (Enter)"
                >
                  ↑
                </button>
              ) : (
                <button
                  type="button"
                  className="xp-button pet-input-action"
                  disabled={disabled}
                  onClick={talk}
                  aria-label={setup ? "Set up voice…" : "Talk"}
                  title={setup ? "Set up voice" : "Talk to your cat"}
                >
                  <svg width="14" height="18" viewBox="0 0 12 16" aria-hidden="true">
                    <rect x="4" y="1" width="4" height="8" rx="2" fill="currentColor" />
                    <path
                      d="M2 7v1a4 4 0 0 0 8 0V7M6 12v3M3 15h6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              )}
            </form>
          )}
        </>
      )}
      {(error || localError || state.error) && (
        <p role="alert" className="pet-voice-error">
          {error || localError || (state.error && voiceMessages[state.error])}
        </p>
      )}
    </section>
  );
}
