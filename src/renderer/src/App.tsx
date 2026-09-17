import { useEffect, useRef, useState } from "react";
import catImage from "../../../assets/computer_cat.png";
import {
  type AppInfo,
  type ChatSnapshot,
  DEFAULT_PREFERENCES,
  type PetPreferences,
} from "../../shared/contracts";
import { CatScene } from "./CatScene";
import { CompanionSettings } from "./CompanionSettings";
import { Icon, type IconName } from "./Icon";
import { Pet } from "./Pet";
import { Settings } from "./Settings";

type View = "chat" | "cat" | "settings";
const navigation: { view: View; icon: IconName; label: string }[] = [
  { view: "chat", icon: "chat", label: "Chat" },
  { view: "cat", icon: "cat", label: "My cat" },
  { view: "settings", icon: "settings", label: "Settings" },
];
const prompts: { icon: IconName; color: string; title: string; detail: string; text: string }[] = [
  {
    icon: "folder",
    color: "amber",
    title: "Make a plan",
    detail: "One little step at a time",
    text: "Help me break a big task into a simple plan. Ask me what I'm working on first.",
  },
  {
    icon: "spark",
    color: "purple",
    title: "Think it through",
    detail: "Find a fresh perspective",
    text: "I'd like to think through an idea. Can you help me explore it?",
  },
  {
    icon: "chat",
    color: "green",
    title: "Say hello",
    detail: "Meet your new sidekick",
    text: "Hey, Computer Cat. Nice to meet you!",
  },
];

export function App() {
  const isPet = new URLSearchParams(window.location.search).get("view") === "pet";
  const [info, setInfo] = useState<AppInfo>();
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ messages: [], busy: false });
  const [preferences, setPreferences] = useState<PetPreferences>(DEFAULT_PREFERENCES);
  const [view, setView] = useState<View>("chat");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLElement>(null);
  const followReply = useRef(true);
  const pendingSend = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelClear = useRef<HTMLButtonElement>(null);
  const focusAfterClear = useRef(false);

  useEffect(() => {
    document.body.classList.toggle("pet-body", isPet);
    let active = true;
    let received = false;
    let receivedPreferences = false;
    let receivedWindow = false;
    const unsubscribe = window.computerCat.onChanged((state) => {
      received = true;
      setSnapshot(state);
    });
    const unsubscribePreferences = window.computerCat.onPreferencesChanged((state) => {
      receivedPreferences = true;
      setPreferences(state);
    });
    const unsubscribeWindow = window.computerCat.onWindowChanged((state) => {
      receivedWindow = true;
      setMaximized(state);
    });
    void Promise.all([window.computerCat.info(), window.computerCat.snapshot()])
      .then(([appInfo, state]) => {
        if (!active) return;
        setInfo(appInfo);
        if (!received) setSnapshot(state);
        if (!receivedPreferences) setPreferences(appInfo.preferences);
        if (!receivedWindow) setMaximized(appInfo.maximized);
      })
      .catch(() => {
        if (active) setError("Couldn't connect to Computer Cat. Please restart the app.");
      });
    return () => {
      active = false;
      unsubscribe();
      unsubscribePreferences();
      unsubscribeWindow();
    };
  }, [isPet]);

  const messageCount = snapshot.messages.length;
  const lastText = snapshot.messages.at(-1)?.text;
  useEffect(() => {
    if ((messageCount > 0 || lastText) && followReply.current && view === "chat")
      end.current?.scrollIntoView({ block: "end" });
  }, [messageCount, lastText, view]);
  useEffect(() => {
    if (view === "chat" && !isPet) input.current?.focus();
  }, [view, isPet]);
  useEffect(() => {
    if (confirmClear) {
      dialog.current?.showModal();
      cancelClear.current?.focus();
    } else {
      dialog.current?.close();
      if (focusAfterClear.current) {
        input.current?.focus();
        focusAfterClear.current = false;
      }
    }
  }, [confirmClear]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function action(run: () => Promise<void>, failure: string) {
    try {
      await run();
    } catch {
      setError(failure);
    }
  }

  async function send() {
    if (!text.trim() || snapshot.busy || pendingSend.current || clearing || !info) return;
    const draft = text;
    pendingSend.current = true;
    setSending(true);
    setError("");
    followReply.current = true;
    try {
      const result = await window.computerCat.send({ id: crypto.randomUUID(), text: draft });
      if (result.ok) setText((current) => (current === draft ? "" : current));
      else setError(result.message);
    } catch {
      setError("Couldn't send that message. Your draft is still here. Please try again.");
    } finally {
      pendingSend.current = false;
      setSending(false);
      input.current?.focus();
    }
  }

  async function clear() {
    setClearing(true);
    try {
      const result = await window.computerCat.clear();
      if (!result.ok) setError(result.message);
      else {
        setError("");
        setText("");
        setView("chat");
        followReply.current = true;
        focusAfterClear.current = true;
      }
    } catch {
      setError("Couldn't start a new chat. Please try again.");
    } finally {
      setClearing(false);
      setConfirmClear(false);
      input.current?.focus();
    }
  }

  function newChat() {
    if (snapshot.busy || sending || clearing) return;
    if (snapshot.messages.length || text.trim()) setConfirmClear(true);
    else {
      setError("");
      setView("chat");
      input.current?.focus();
    }
  }

  async function updatePreferences(patch: Partial<PetPreferences>) {
    const previous = preferences;
    setPreferences({ ...previous, ...patch });
    setSaving(true);
    setError("");
    try {
      const result = await window.computerCat.updatePreferences(patch);
      if (!result.ok) {
        setPreferences(previous);
        setError(result.message);
      }
    } catch {
      setPreferences(previous);
      setError("Couldn't update your cat. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const stop = () =>
    void action(() => window.computerCat.stop(), "Couldn't stop the reply. Please try again.");
  const desktop = () =>
    void action(
      () => window.computerCat.hideChat(),
      "Couldn't return to the desktop. Please try again.",
    );
  const ready = Boolean(info);
  const modeLabel = !info
    ? "Connecting…"
    : info.mode === "demo"
      ? "Local demo"
      : info.configured
        ? "Model configured"
        : "Model setup needed";
  const working = snapshot.busy || sending;

  if (isPet)
    return (
      <Pet
        snapshot={snapshot}
        preferences={preferences}
        error={error}
        openChat={() => void action(() => window.computerCat.openChat(), "Couldn't open chat.")}
        stop={stop}
      />
    );

  return (
    <div className={`app-shell ${maximized ? "maximized" : ""}`}>
      <header className="titlebar">
        <div className="window-title">
          <img src={catImage} alt="" />
          <span>Computer Cat</span>
          <span className="titlebar-tagline">your desktop companion</span>
        </div>
        <div className="window-controls">
          <button
            type="button"
            aria-label="Minimize window"
            title="Minimize"
            onClick={() =>
              void action(() => window.computerCat.minimizeChat(), "Couldn't minimize the window.")
            }
          >
            <span className="minimize-glyph" />
          </button>
          <button
            type="button"
            aria-label={maximized ? "Restore window" : "Maximize window"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={() =>
              void action(
                () => window.computerCat.toggleMaximizeChat(),
                "Couldn't resize the window.",
              )
            }
          >
            <span className={maximized ? "restore-glyph" : "maximize-glyph"} />
          </button>
          <button
            type="button"
            className="close-control"
            aria-label="Close chat to desktop"
            title="Close chat · your cat stays on the desktop"
            onClick={desktop}
          >
            <span className="close-glyph" />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="Main navigation">
          <div className="brand">
            <span className="brand-icon">
              <Icon name="cat" />
            </span>
            <div>
              <strong>Computer Cat</strong>
              <span>A little desktop magic.</span>
            </div>
          </div>
          <button
            type="button"
            className="xp-button new-chat"
            onClick={newChat}
            disabled={working || clearing || !ready}
          >
            <Icon name="plus" />
            New conversation
          </button>
          <span className="nav-label">YOUR SPACE</span>
          <nav>
            {navigation.map((item) => (
              <button
                type="button"
                key={item.view}
                className={`nav-item ${view === item.view ? "selected" : ""}`}
                aria-current={view === item.view ? "page" : undefined}
                onClick={() => setView(item.view)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {view === item.view && <span className="nav-current" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-companion">
            <CatScene compact animation={preferences.animation} />
            <strong>Good company, anywhere.</strong>
            <p>Your cat is a click away.</p>
            <button type="button" className="text-button" onClick={desktop}>
              Hang out on desktop
              <Icon name="arrow" />
            </button>
          </div>
          <button
            type="button"
            className="connection"
            onClick={() => setView("settings")}
            title="View connection details"
          >
            <span
              className={`status-dot ${info?.mode === "pi" && !info.configured ? "amber" : ""}`}
            />
            <span>
              <strong>{modeLabel}</strong>
              <small>
                {info?.mode === "pi"
                  ? (info.model ?? "Open settings for details")
                  : "A safe place to try things"}
              </small>
            </span>
            <Icon name="help" />
          </button>
        </aside>
        <main className="main-panel">
          <header className="toolbar">
            <div className="location">
              <span className="toolbar-icon">
                <Icon name={view === "chat" ? "chat" : view === "cat" ? "cat" : "settings"} />
              </span>
              <div>
                <strong>
                  {view === "chat"
                    ? "Chat with Computer Cat"
                    : view === "cat"
                      ? "My desktop companion"
                      : "Settings"}
                </strong>
                <span>
                  {view === "chat"
                    ? "A friendly place to figure things out."
                    : view === "cat"
                      ? "Small cat. Your kind of company."
                      : "Make the little details yours."}
                </span>
              </div>
            </div>
            <button type="button" className="xp-button desktop-button" onClick={desktop}>
              <Icon name="desktop" />
              <span>Desktop mode</span>
            </button>
          </header>
          {error && (
            <div className="error-banner" role="alert">
              <Icon name="help" />
              <span>{error}</span>
              <button
                type="button"
                className="text-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </div>
          )}
          {view === "cat" ? (
            <CompanionSettings
              preferences={preferences}
              saving={saving || !ready}
              update={(patch) => void updatePreferences(patch)}
              showPet={() =>
                void action(async () => {
                  await window.computerCat.showPet();
                  setNotice("Your cat is on the desktop. Say hello!");
                }, "Couldn't show your cat. Please try again.")
              }
              desktop={desktop}
            />
          ) : view === "settings" ? (
            <Settings
              info={info}
              busy={working || clearing || !ready}
              clear={newChat}
              quit={() =>
                void action(
                  () => window.computerCat.quit(),
                  "Couldn't quit Computer Cat. Please try again.",
                )
              }
            />
          ) : (
            <>
              <section
                className="conversation"
                aria-label="Conversation"
                ref={scroll}
                onScroll={() => {
                  const element = scroll.current;
                  if (element)
                    followReply.current =
                      element.scrollHeight - element.scrollTop - element.clientHeight < 70;
                }}
              >
                {messageCount === 0 ? (
                  <div className="welcome">
                    <div className="welcome-hero">
                      <div className="welcome-copy">
                        <span className="eyebrow">
                          <span className="pixel-spark">✦</span>HELLO, FRIEND
                        </span>
                        <h1>
                          A little company.
                          <br />
                          <span>A little help.</span>
                        </h1>
                        <p>
                          Big ideas, small questions, or just a hello.
                          <br />
                          Life at your desk is better with a cat.
                        </p>
                      </div>
                      <CatScene animation={preferences.animation} />
                    </div>
                    <div className="welcome-actions">
                      <div className="section-heading">
                        <h2>Where shall we start?</h2>
                        <span>Pick an idea. Make it yours.</span>
                      </div>
                      <div className="suggestions">
                        {prompts.map((prompt) => (
                          <button
                            key={prompt.title}
                            type="button"
                            className="prompt-card"
                            disabled={!ready || working}
                            onClick={() => {
                              setText(prompt.text);
                              input.current?.focus();
                            }}
                          >
                            <span className={`feature-icon ${prompt.color}`}>
                              <Icon name={prompt.icon} />
                            </span>
                            <strong>{prompt.title}</strong>
                            <span>{prompt.detail}</span>
                            <Icon name="arrow" className="prompt-arrow" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="welcome-tip">
                      <Icon name="desktop" />
                      {info?.mode === "pi"
                        ? "Your cat can keep you company while you work. Try Desktop mode."
                        : "You're in demo mode. Try a chat with sample replies, free of API calls."}
                    </p>
                  </div>
                ) : (
                  <div
                    className="messages"
                    role="log"
                    aria-label="Chat messages"
                    aria-live="polite"
                    aria-relevant="additions"
                  >
                    <div className="conversation-start">
                      <span />A little conversation starts here
                      <span />
                    </div>
                    {snapshot.messages.map((message) => (
                      <article
                        key={message.id}
                        className={`message ${message.role}`}
                        data-state={message.state}
                      >
                        <div className="message-avatar">
                          {message.role === "assistant" ? (
                            <img src={catImage} alt="" />
                          ) : (
                            <span>You</span>
                          )}
                        </div>
                        <div className="message-content">
                          <div className="message-name">
                            {message.role === "assistant" ? "Computer Cat" : "You"}
                            {message.role === "assistant" && info?.mode === "demo" && (
                              <span className="message-mode">DEMO</span>
                            )}
                            {message.state === "streaming" && (
                              <span className="thinking-dots" role="img" aria-label="Thinking">
                                <i />
                                <i />
                                <i />
                              </span>
                            )}
                          </div>
                          <div className="message-bubble">
                            <p>
                              {message.text ||
                                (message.state === "streaming"
                                  ? "Let me think about that…"
                                  : message.state === "stopped"
                                    ? "Reply stopped. We can pick up whenever you're ready."
                                    : "No reply received. Please try again.")}
                            </p>
                          </div>
                          {message.state === "stopped" && message.text && (
                            <small className="message-note">Reply stopped</small>
                          )}
                          {message.state === "error" && (
                            <small className="message-note danger">
                              Reply interrupted · You can try sending again.
                            </small>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div ref={end} />
              </section>
              <div className="composer-area">
                <form
                  className="composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                  }}
                >
                  <label className="sr-only" htmlFor="message-input">
                    Message Computer Cat
                  </label>
                  <textarea
                    id="message-input"
                    ref={input}
                    placeholder="What's on your mind?"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    maxLength={6000}
                    rows={2}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="composer-tools">
                    <span>
                      <Icon name="chat" />
                      {working ? "Your cat is thinking…" : "A question. An idea. Anything."}
                    </span>
                    <div className="composer-actions">
                      {text.length > 5500 && (
                        <span className="character-count">
                          {text.length.toLocaleString()} / 6,000
                        </span>
                      )}
                      {snapshot.busy ? (
                        <button
                          type="button"
                          className="xp-button stop-button"
                          onClick={stop}
                          aria-label="Stop reply"
                        >
                          <Icon name="stop" />
                          Stop
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="xp-button primary send-button"
                          disabled={!text.trim() || sending || clearing || !ready}
                          aria-label="Send message"
                        >
                          Send
                          <Icon name="arrow" />
                        </button>
                      )}
                    </div>
                  </div>
                </form>
                <div className="composer-footer">
                  <span>
                    <span
                      className={`status-dot ${info?.mode === "pi" && !info.configured ? "amber" : ""}`}
                    />
                    {modeLabel}
                    {info?.mode === "demo" && <span> · No API calls</span>}
                  </span>
                  <span>
                    <kbd>Enter</kbd> to send <span className="footer-divider">·</span>{" "}
                    <kbd>Shift + Enter</kbd> for a new line
                  </span>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      <footer className="statusbar">
        <span role="status">
          <span className="status-dot" />
          {notice ||
            (working ? "Thinking… you can stop a reply at any time." : "Ready when you are.")}
        </span>
        <span>
          Made for a friendlier desktop
          <span className="statusbar-grip" aria-hidden="true">
            ◢
          </span>
        </span>
      </footer>
      <dialog
        className="xp-dialog"
        ref={dialog}
        onCancel={() => setConfirmClear(false)}
        aria-labelledby="clear-title"
        aria-describedby="clear-description"
      >
        <div className="dialog-titlebar">
          <Icon name="chat" />
          New conversation
        </div>
        <div className="dialog-content">
          <span className="feature-icon amber">
            <Icon name="help" />
          </span>
          <div>
            <h2 id="clear-title">Start a fresh conversation?</h2>
            <p id="clear-description">
              This clears your current chat and draft. Your cat settings stay saved.
            </p>
          </div>
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="xp-button"
            ref={cancelClear}
            onClick={() => setConfirmClear(false)}
            disabled={clearing}
          >
            Keep chatting
          </button>
          <button
            type="button"
            className="xp-button primary"
            disabled={clearing}
            onClick={() => void clear()}
          >
            {clearing ? "Starting…" : "Start new chat"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
