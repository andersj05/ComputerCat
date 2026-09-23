import { useEffect, useRef, useState } from "react";
import catImage from "../../../assets/computer_cat.png";
import {
  type AppInfo,
  type ChatSnapshot,
  DEFAULT_PREFERENCES,
  type PetPreferences,
} from "../../shared/contracts";
import { activeModelInfo } from "../../shared/models";
import { voiceMessages } from "../../shared/voice";
import { HistoryDialog } from "./HistoryDialog";
import { Icon } from "./Icon";
import { MarkdownMessage } from "./MarkdownMessage";
import { ModelControls, ModelPickerDialog } from "./ModelPicker";
import { OptionsDialog } from "./OptionsDialog";
import { Pet } from "./Pet";
import { ToolActivity } from "./ToolActivity";
import { TASK_STARTERS } from "./task-starters";
import { PetVoice } from "./voice/PetVoice";
import { useVoice } from "./voice/useVoice";
import { VoiceControls } from "./voice/VoiceControls";
import { WindowCaption } from "./WindowCaption";

export function App() {
  const isPet = new URLSearchParams(window.location.search).get("view") === "pet";
  const [info, setInfo] = useState<AppInfo>();
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ messages: [], busy: false });
  const [preferences, setPreferences] = useState<PetPreferences>(DEFAULT_PREFERENCES);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const text = drafts[snapshot.conversationId ?? ""] ?? "";
  const draftRevision = useRef(0);
  function setText(value: string) {
    draftRevision.current++;
    setDrafts((previous) => ({ ...previous, [snapshot.conversationId ?? ""]: value }));
  }
  const voice = useVoice(isPet, {
    conversationId: snapshot.conversationId,
    text,
    revision: draftRevision.current,
    insert: setText,
  });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [petVoiceOpen, setPetVoiceOpen] = useState(false);
  const [petExpanded, setPetExpanded] = useState(false);
  useEffect(() => {
    if (!isPet) return;
    const update = () => {
      const catHeight = { small: 244, medium: 298, large: 352 }[preferences.size];
      setPetExpanded(window.innerWidth >= 580 || window.innerHeight - catHeight >= 470);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isPet, preferences.size]);
  const petVoiceStarting = useRef(false);
  const petTalkHandler = useRef<() => void>(() => {});
  petTalkHandler.current = () => {
    void startPetVoice();
  };
  async function openPetPanel() {
    await window.computerCat.setPetVoiceOpen(true);
    setPetVoiceOpen(true);
  }
  async function expandPetPanel() {
    await window.computerCat.setPetExpanded(!petExpanded);
    setPetExpanded(!petExpanded);
  }
  async function startPetVoice(resumeDraft = true) {
    if (petVoiceStarting.current) return;
    petVoiceStarting.current = true;
    setError("");
    try {
      await openPetPanel();
      if ((resumeDraft && (text || voice.review)) || voice.busy || snapshot.busy) return;
      if (["disabled", "model-missing"].includes(voice.snapshot.availability)) return;
      const result = await window.computerCat.voiceStart();
      if (!result.ok) setError(voiceMessages[result.code]);
    } catch {
      setError("Couldn't start voice input. Try again.");
    } finally {
      petVoiceStarting.current = false;
    }
  }
  async function closePetVoice() {
    if (voice.busy && voice.snapshot.owner === "pet" && voice.snapshot.sessionId)
      await window.computerCat.voiceCancel({ sessionId: voice.snapshot.sessionId });
    await window.computerCat.setPetVoiceOpen(false);
    setPetVoiceOpen(false);
    setPetExpanded(false);
    setConfirmClear(false);
  }
  const [maximized, setMaximized] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsTab, setOptionsTab] = useState<"cat" | "models" | "voice">("cat");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLElement>(null);
  const followReply = useRef(true);
  const pendingSend = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelClear = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.classList.toggle("pet-body", isPet);
    let active = true;
    let received = false;
    let receivedPreferences = false;
    let receivedWindow = false;
    let latestModels: AppInfo["models"] | undefined;
    const unsubscribeOptions = window.computerCat.onOptionsRequested((tab) => {
      if (!isPet) {
        setOptionsTab(tab ?? "cat");
        setModelsOpen(false);
        setHistoryOpen(false);
        setOptionsOpen(true);
      }
    });
    const unsubscribeTalk = window.computerCat.onPetTalkRequested(() => {
      if (isPet) petTalkHandler.current();
    });
    const unsubscribeHistory = window.computerCat.onHistoryRequested(() => {
      if (!isPet) {
        setOptionsOpen(false);
        setModelsOpen(false);
        setHistoryOpen(true);
      }
    });
    const unsubscribeModelPicker = window.computerCat.onModelsRequested(() => {
      if (!isPet) {
        setHistoryOpen(false);
        setOptionsOpen(false);
        setModelsOpen(true);
      }
    });
    const unsubscribeModels = window.computerCat.onModelsChanged((state) => {
      latestModels = state;
      setInfo((current) =>
        current ? { ...current, ...activeModelInfo(state), models: state } : current,
      );
    });
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
        setInfo(
          latestModels
            ? { ...appInfo, ...activeModelInfo(latestModels), models: latestModels }
            : appInfo,
        );
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
      unsubscribeModels();
      unsubscribeOptions();
      unsubscribeModelPicker();
      unsubscribeHistory();
      unsubscribeTalk();
    };
  }, [isPet]);

  const messageCount = snapshot.messages.length;
  const lastText = snapshot.messages.at(-1)?.text;
  useEffect(() => {
    if ((messageCount > 0 || lastText) && followReply.current)
      end.current?.scrollIntoView({ block: "end" });
  }, [messageCount, lastText]);
  useEffect(() => {
    if (confirmClear) {
      dialog.current?.showModal();
      cancelClear.current?.focus();
    } else {
      dialog.current?.close();
      if (!isPet && !optionsOpen && !modelsOpen && !historyOpen) input.current?.focus();
    }
  }, [confirmClear, optionsOpen, modelsOpen, historyOpen, isPet]);

  async function action(run: () => Promise<void>, failure: string) {
    try {
      await run();
    } catch {
      setError(failure);
    }
  }

  useEffect(() => {
    if (
      (optionsOpen || historyOpen || modelsOpen || confirmClear) &&
      voice.snapshot.sessionId &&
      voice.busy
    )
      void window.computerCat.voiceCancel({ sessionId: voice.snapshot.sessionId });
  }, [optionsOpen, historyOpen, modelsOpen, confirmClear, voice.busy, voice.snapshot.sessionId]);

  async function send() {
    if (voice.busy) return;
    if (!text.trim() || snapshot.busy || pendingSend.current || clearing || !info) return;
    const draft = text;
    const revision = draftRevision.current;
    pendingSend.current = true;
    setSending(true);
    setError("");
    followReply.current = true;
    try {
      const result = await window.computerCat.send({ id: crypto.randomUUID(), text: draft });
      if (result.ok) {
        if (draftRevision.current === revision) setText("");
      } else setError(result.message);
    } catch {
      setError("Couldn't send your message. Try again.");
    } finally {
      pendingSend.current = false;
      setSending(false);
      input.current?.focus();
    }
  }

  async function clear() {
    if (clearing) return;
    setClearing(true);
    try {
      const result = await window.computerCat.clear();
      if (!result.ok) setError(result.message);
      else {
        setError("");
        setText("");
        if (snapshot.conversationId) voice.dropReview(snapshot.conversationId);
        followReply.current = true;
      }
    } catch {
      setError("Couldn't start a new conversation. Try again.");
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  function newChat() {
    if (snapshot.busy || voice.busy || sending || clearing || !info) return;
    if (text.trim() || voice.review.trim()) setConfirmClear(true);
    else {
      setError("");
      void clear();
    }
  }

  const stop = () =>
    void action(() => window.computerCat.stop(), "Couldn't stop the reply. Try again.");
  const desktop = () =>
    void action(() => window.computerCat.hideChat(), "Couldn't hide the chat window.");
  const ready = Boolean(info);
  const working = snapshot.busy || sending || voice.busy;
  const modeLabel = !info
    ? "Connecting…"
    : info.mode === "demo"
      ? "Demo — no API calls"
      : info.configured
        ? (info.model ?? "Configured model")
        : "Model setup needed";

  if (isPet)
    return (
      <Pet
        snapshot={snapshot}
        preferences={preferences}
        error={error}
        openChat={() => void action(openPetPanel, "Couldn't open the cat panel.")}
        openOptions={() =>
          void action(() => window.computerCat.openOptions(), "Couldn't open Options.")
        }
        modelLabel={info?.mode === "demo" ? "Local demo" : (info?.model ?? "Choose model")}
        openModels={() =>
          void action(() => window.computerCat.openModels(), "Couldn't open model selection.")
        }
        talkShortcut={info?.talkShortcut}
        voice={voice.snapshot}
        hasDraft={!!(text.trim() || voice.review.trim())}
        voiceBusy={voice.busy}
        talk={() => void startPetVoice()}
        voicePanel={
          petVoiceOpen ? (
            <PetVoice
              state={voice.snapshot}
              chat={snapshot}
              text={text}
              setText={setText}
              review={voice.review}
              setReview={voice.setReview}
              send={() => void send()}
              sending={sending}
              error={error || snapshot.persistenceError || ""}
              close={() => void action(closePetVoice, "Couldn't close the cat panel.")}
              start={() => void startPetVoice(false)}
              expanded={petExpanded}
              expand={() => void action(expandPetPanel, "Couldn't resize the cat panel.")}
              openChat={() =>
                void action(() => window.computerCat.openChat(), "Couldn't open chat.")
              }
              newChat={newChat}
              history={() =>
                void action(() => window.computerCat.openHistory(), "Couldn't open History.")
              }
              clearing={clearing}
              ready={ready}
              confirmClear={confirmClear}
              cancelClear={() => setConfirmClear(false)}
              clear={() => void clear()}
              modelLabel={info?.mode === "demo" ? "Local demo" : (info?.model ?? "Choose model")}
              openModels={() =>
                void action(() => window.computerCat.openModels(), "Couldn't open model selection.")
              }
              options={() => void window.computerCat.openOptions("voice")}
            />
          ) : undefined
        }
        stop={stop}
      />
    );

  return (
    <div className={`app-shell ${maximized ? "maximized" : ""}`}>
      <WindowCaption
        title={
          snapshot.messages.length
            ? `${snapshot.title ?? "Conversation"} — Computer Cat`
            : "Computer Cat"
        }
        maximized={maximized}
        onClose={desktop}
        onMinimize={() =>
          void action(() => window.computerCat.minimizeChat(), "Couldn't minimize the window.")
        }
        onMaximize={() =>
          void action(() => window.computerCat.toggleMaximizeChat(), "Couldn't resize the window.")
        }
      />
      <div className="toolbar">
        <button
          type="button"
          className="toolbar-button"
          onClick={newChat}
          disabled={working || clearing || !ready}
        >
          <Icon name="new" />
          New conversation
        </button>
        <button
          type="button"
          className="toolbar-button"
          onClick={() => setHistoryOpen(true)}
          disabled={working || clearing || !ready}
        >
          History…
        </button>
        <span className="toolbar-separator" aria-hidden="true" />
        <button
          type="button"
          className="toolbar-button"
          onClick={() => {
            setOptionsTab("cat");
            setOptionsOpen(true);
          }}
          disabled={!ready}
        >
          <Icon name="options" />
          Options…
        </button>
        <button
          type="button"
          className="toolbar-button desktop-button"
          onClick={desktop}
          title="Hide chat and keep the cat on your desktop"
        >
          <Icon name="desktop" />
          Desktop
        </button>
      </div>
      <ModelControls
        state={info?.models}
        busy={working || clearing}
        onConnections={() => {
          setOptionsTab("models");
          setOptionsOpen(true);
        }}
      />
      {(error || snapshot.persistenceError) && (
        <div className="error-banner" role="alert">
          <Icon name="help" />
          <span>{error || snapshot.persistenceError}</span>
          {error && (
            <button
              type="button"
              className="xp-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      <main className="chat-content">
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
              <img src={catImage} alt="Computer Cat" draggable="false" />
              <p>What can I help you with?</p>
              {!text && (
                <div className="starter-links">
                  {TASK_STARTERS.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      disabled={!ready || working}
                      onClick={() => {
                        setText(prompt.text);
                        input.current?.focus();
                      }}
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="messages"
              role="log"
              aria-label="Chat messages"
              aria-live="polite"
              aria-relevant="additions"
            >
              {snapshot.messages.map((message) => (
                <article
                  key={message.id}
                  className={`message ${message.role}`}
                  data-state={message.state}
                >
                  <span className="message-name">
                    {message.role === "assistant" ? "Computer Cat" : "You"}:
                  </span>
                  {message.role === "assistant" && message.text ? (
                    <MarkdownMessage text={message.text} />
                  ) : (
                    <p>
                      {message.text ||
                        (message.state === "streaming"
                          ? "…"
                          : message.state === "stopped"
                            ? "Reply stopped."
                            : "No reply received. Try again.")}
                    </p>
                  )}
                  {message.tools?.length ? <ToolActivity tools={message.tools} /> : null}
                  {message.state === "stopped" && message.text && (
                    <small className="message-note">Reply stopped</small>
                  )}
                  {message.state === "error" && (
                    <small className="message-note danger">
                      Reply interrupted. Try sending again.
                    </small>
                  )}
                </article>
              ))}
            </div>
          )}
          <div ref={end} />
        </section>
        <VoiceControls
          state={voice.snapshot}
          busy={voice.busy}
          agentBusy={snapshot.busy || sending}
          review={voice.review}
          onReview={voice.setReview}
          onOptions={() => {
            setOptionsTab("voice");
            setOptionsOpen(true);
          }}
          onInsert={() => {
            const combined = text ? `${text.trimEnd()} ${voice.review}` : voice.review;
            if (combined.length > 6000) {
              setError("Edit the transcript so the combined message fits 6,000 characters.");
              return;
            }
            setText(combined);
            voice.setReview("");
          }}
        />
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="input-area">
            <label className="sr-only" htmlFor="message-input">
              Message Computer Cat
            </label>
            <textarea
              id="message-input"
              ref={input}
              placeholder="Type a message…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={6000}
              rows={3}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="input-hint">
              <span>Enter to send · Shift+Enter for a new line</span>
              {text.length > 5500 && <span>{text.length.toLocaleString()} / 6,000</span>}
            </div>
          </div>
          {snapshot.busy || voice.busy ? (
            <button
              type="button"
              className="xp-button send-button"
              onClick={stop}
              aria-label="Stop reply"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="xp-button default-button send-button"
              disabled={!text.trim() || sending || clearing || voice.busy || !ready}
              aria-label="Send message"
            >
              Send
            </button>
          )}
        </form>
      </main>
      <footer className="statusbar">
        <span role="status">
          {working
            ? snapshot.messages.at(-1)?.tools?.findLast((tool) => tool.state === "running")
              ? `Using ${snapshot.messages.at(-1)?.tools?.findLast((tool) => tool.state === "running")?.name}…`
              : "Computer Cat is working…"
            : "Ready"}
        </span>
        <span title={modeLabel}>{modeLabel}</span>
        <span className="statusbar-grip" aria-hidden="true" />
      </footer>
      {optionsOpen && (
        <OptionsDialog
          key={optionsTab}
          initialTab={optionsTab}
          info={info}
          busy={snapshot.busy}
          preferences={preferences}
          voice={voice.snapshot}
          onApply={(next) => window.computerCat.updatePreferences(next)}
          onClose={() => setOptionsOpen(false)}
          onShowPet={() => window.computerCat.showPet()}
          onQuit={() => window.computerCat.quit()}
        />
      )}
      {historyOpen && (
        <HistoryDialog
          currentId={snapshot.conversationId}
          onClose={() => setHistoryOpen(false)}
          onOpen={async (id) => {
            const result = await window.computerCat.openConversation(id);
            if (result.ok) {
              setError("");
              followReply.current = true;
            }
            return result;
          }}
          onDeleted={(id) => {
            setDrafts((previous) => {
              const next = { ...previous };
              delete next[id];
              return next;
            });
            voice.dropReview(id);
          }}
        />
      )}
      {modelsOpen && (
        <ModelPickerDialog
          state={info?.models}
          busy={working}
          onClose={() => setModelsOpen(false)}
          onConnections={() => {
            setModelsOpen(false);
            setOptionsTab("models");
            setOptionsOpen(true);
          }}
        />
      )}
      <dialog
        className="xp-dialog clear-dialog"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          if (!clearing) setConfirmClear(false);
        }}
        aria-labelledby="clear-title"
        aria-describedby="clear-description"
      >
        <WindowCaption
          title="New conversation"
          titleId="clear-title"
          onClose={() => setConfirmClear(false)}
          disabled={clearing}
        />
        <div className="dialog-content">
          <span className="question-icon" aria-hidden="true">
            ?
          </span>
          <p id="clear-description">
            Start a new conversation and discard this unsent draft? Your current conversation stays
            in History.
          </p>
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="xp-button"
            ref={cancelClear}
            onClick={() => setConfirmClear(false)}
            disabled={clearing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="xp-button"
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
