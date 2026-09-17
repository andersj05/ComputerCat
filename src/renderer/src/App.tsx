import { useEffect, useRef, useState } from "react";
import catImage from "../../../assets/computer-cat.png";
import type { AppInfo, ChatSnapshot } from "../../shared/contracts";

const prompts = ["Say hello", "What can you do?", "Can you see my screen?"];

export function App() {
  const isPet = new URLSearchParams(window.location.search).get("view") === "pet";
  const [info, setInfo] = useState<AppInfo>();
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ messages: [], busy: false });
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.body.classList.toggle("pet-body", isPet);
    let active = true;
    let received = false;
    const unsubscribe = window.computerCat.onChanged((state) => {
      received = true;
      setSnapshot(state);
    });
    void Promise.all([window.computerCat.info(), window.computerCat.snapshot()])
      .then(([appInfo, state]) => {
        if (!active) return;
        setInfo(appInfo);
        if (!received) setSnapshot(state);
      })
      .catch(() => {
        if (active) setError("Couldn't connect to Computer Cat. Please restart the app.");
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isPet]);

  const messageCount = snapshot.messages.length;
  const lastText = snapshot.messages.at(-1)?.text;
  useEffect(() => {
    if (messageCount > 0 || lastText) end.current?.scrollIntoView({ block: "end" });
  }, [messageCount, lastText]);

  async function send(message = text) {
    if (!message.trim() || snapshot.busy || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await window.computerCat.send({ id: crypto.randomUUID(), text: message });
      if (result.ok) setText("");
      else setError(result.message);
    } catch {
      setError("Couldn't send that message. Please try again.");
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  async function clear() {
    const result = await window.computerCat.clear();
    if (!result.ok) setError(result.message);
    else {
      setError("");
      setSettings(false);
    }
    input.current?.focus();
  }

  if (isPet)
    return (
      <div className="pet-wrap">
        <div className="pet-handle" title="Drag to move your cat">
          · · ·
        </div>
        <button
          type="button"
          className={`pet-button ${snapshot.busy ? "working" : ""}`}
          onClick={() => void window.computerCat.openChat()}
          aria-label="Open Computer Cat chat"
        >
          <img src={catImage} alt="Computer Cat in a cowboy hat" draggable="false" />
          <span className="pet-status">{snapshot.busy ? "Thinking…" : "Hey, you."}</span>
        </button>
        {snapshot.busy && (
          <button type="button" className="pet-stop" onClick={() => void window.computerCat.stop()}>
            Stop
          </button>
        )}
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            cc<span>✦</span>
          </span>
          <div>
            Computer Cat<small>YOUR DESKTOP COMPANION</small>
          </div>
        </div>
        <button
          type="button"
          className="new-chat"
          onClick={() => void clear()}
          disabled={snapshot.busy}
        >
          ＋ <span>New conversation</span>
        </button>
        <div className="nav-label">YOUR SPACE</div>
        <button
          type="button"
          className={`nav-item ${!settings ? "selected" : ""}`}
          onClick={() => setSettings(false)}
        >
          <span>◌</span> Conversation
        </button>
        <button
          type="button"
          className={`nav-item ${settings ? "selected" : ""}`}
          onClick={() => setSettings(true)}
        >
          <span>⚙</span> Preferences
        </button>
        <div className="sidebar-note">
          <span className="tiny-star">✦</span>
          <p>
            A little company.
            <br />A little help.
          </p>
          <span>Right here, when you need me.</span>
        </div>
        <div className="connection">
          <span className="status-dot" />
          <div>
            {info?.mode === "pi" ? "Pi mode" : "Local demo"}
            <small>{info?.mode === "pi" ? info.model : "No API calls"}</small>
          </div>
          <span className="version">v{info?.version ?? "0.1.0"}</span>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">COMPUTER CAT</span>
            <strong>{settings ? "Make yourself at home" : "A good place to start"}</strong>
          </div>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void window.computerCat.hideChat()}
            title="Keep the cat on your desktop"
          >
            Back to desktop ↗
          </button>
        </header>
        {settings ? (
          <section className="preferences">
            <span className="eyebrow">THE LITTLE DETAILS</span>
            <h1>Your cat, your space.</h1>
            <p className="muted">A simple start. More ways to make this yours are on the way.</p>
            <div className="preference-row">
              <div>
                <strong>Conversation mode</strong>
                <p>
                  {info?.mode === "pi"
                    ? `${info.provider} · ${info.model}`
                    : "A local demo with sample replies. No model is connected."}
                </p>
              </div>
              <span className="pill">{info?.mode === "pi" ? "Pi" : "Demo"}</span>
            </div>
            <div className="preference-row">
              <div>
                <strong>Bring me back</strong>
                <p>Open your conversation from anywhere.</p>
              </div>
              <kbd>{info?.shortcut ?? "Ctrl+Shift+Space"}</kbd>
            </div>
            <div className="preference-row">
              <div>
                <strong>Screen & app access</strong>
                <p>Computer tools aren't connected in this first version.</p>
              </div>
              <span className="pill neutral">Off</span>
            </div>
            <div className="preference-row">
              <div>
                <strong>Conversation history</strong>
                <p>Kept for this app session. New conversation clears it.</p>
              </div>
              <button
                type="button"
                className="quiet-button"
                disabled={snapshot.busy}
                onClick={() => void clear()}
              >
                Clear chat
              </button>
            </div>
            <button
              type="button"
              className="quit-button"
              onClick={() => void window.computerCat.quit()}
            >
              Quit Computer Cat
            </button>
          </section>
        ) : (
          <>
            <section className="conversation" aria-label="Conversation">
              {snapshot.messages.length === 0 ? (
                <div className="welcome">
                  <div className="portrait-wrap">
                    <span className="portrait-spark spark-one">✦</span>
                    <img src={catImage} alt="Your Computer Cat, wearing a tiny cowboy hat" />
                    <span className="portrait-spark spark-two">✧</span>
                    <span className="portrait-label">small cat. big plans.</span>
                  </div>
                  <span className="eyebrow">NICE TO MEET YOU</span>
                  <h1>
                    Hey, I'm your
                    <br />
                    <em>Computer Cat.</em>
                  </h1>
                  <p>Pull up a chair. I'm here to lend a paw.</p>
                  <div className="suggestions">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void send(prompt)}
                        disabled={sending}
                      >
                        {prompt}
                        <span>↗</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="messages">
                  {snapshot.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`message ${message.role}`}
                      data-state={message.state}
                    >
                      <div className="message-name">
                        {message.role === "assistant" ? (
                          <>
                            <img src={catImage} alt="" />
                            Computer Cat
                          </>
                        ) : (
                          "You"
                        )}
                        {message.state === "streaming" && <span className="thinking-dot" />}
                      </div>
                      <p>
                        {message.text ||
                          (message.state === "streaming"
                            ? "Thinking…"
                            : message.state === "stopped"
                              ? "Stopped."
                              : "No reply received.")}
                      </p>
                      {message.state === "stopped" && message.text && (
                        <small className="muted">Stopped</small>
                      )}
                    </article>
                  ))}
                </div>
              )}
              <div ref={end} />
            </section>
            <div className="composer-area">
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <textarea
                  ref={input}
                  aria-label="Message Computer Cat"
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
                    <span className="status-dot" />
                    {snapshot.busy ? "Working on a reply" : "Here when you need me"}
                  </span>
                  {snapshot.busy ? (
                    <button
                      type="button"
                      className="send-button stop-button"
                      onClick={() => void window.computerCat.stop()}
                      aria-label="Stop reply"
                    >
                      ■
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="send-button"
                      disabled={!text.trim() || sending}
                      aria-label="Send message"
                    >
                      ↑
                    </button>
                  )}
                </div>
              </form>
              <div className="composer-footer">
                <span>
                  {info?.mode === "pi"
                    ? "Powered by Pi · Conversation stays in this session"
                    : "DEMO MODE · Sample replies, no API calls"}
                </span>
                <span>Enter to send · Shift+Enter for a new line</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
