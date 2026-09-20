import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ChatSnapshot, PetPreferences } from "../../shared/contracts";
import { type VoiceSnapshot, voiceMessages } from "../../shared/voice";
import { PetArtwork } from "./PetArtwork";
import { newlyCompletedReply, PET_ACTIVITIES } from "./pet-activity";
import { usePetActivity } from "./usePetActivity";

export function Pet({
  snapshot,
  preferences,
  error,
  openChat,
  openOptions,
  openModels,
  modelLabel,
  talkShortcut,
  stop,
  talk,
  voice,
  hasDraft,
  voiceBusy,
  voicePanel,
}: {
  snapshot: ChatSnapshot;
  preferences: PetPreferences;
  error: string;
  openChat: () => void;
  openOptions: () => void;
  openModels: () => void;
  modelLabel: string;
  talkShortcut: string | undefined;
  stop: () => void;
  talk: () => void;
  voice: VoiceSnapshot;
  hasDraft: boolean;
  voiceBusy: boolean;
  voicePanel?: ReactNode;
}) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const catButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const hide = () => setControlsVisible(false);
    const visibility = () => setHidden(document.hidden);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  function act(action: () => void) {
    setControlsVisible(false);
    action();
  }
  const pointer = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragError, setDragError] = useState("");
  async function drag(phase: "start" | "move" | "end" | "cancel") {
    try {
      return await window.computerCat.dragPet(phase);
    } catch {
      setDragError("Couldn't move cat. Try again.");
      return { moved: true };
    }
  }
  const lastReply = snapshot.messages.findLast((message) => message.role === "assistant");
  const activity = usePetActivity(snapshot, voice, error || dragError, hasDraft);
  const [replyReady, setReplyReady] = useState(false);
  const previous = useRef(snapshot);
  const panelOpen = Boolean(voicePanel);
  useEffect(() => {
    if (panelOpen || snapshot.busy || previous.current.conversationId !== snapshot.conversationId)
      setReplyReady(false);
    else if (newlyCompletedReply(previous.current, snapshot)) setReplyReady(true);
    previous.current = snapshot;
  }, [panelOpen, snapshot]);
  const status =
    activity === "idle" ? (replyReady ? "Reply ready" : "") : PET_ACTIVITIES[activity].label;
  const detail =
    error ||
    dragError ||
    snapshot.persistenceError ||
    (voice.error ? voiceMessages[voice.error] : "") ||
    (lastReply?.state === "error" ? "Reply interrupted. Open chat to try again." : "");
  return (
    <main
      className={`pet-wrap ${preferences.animation ? "animated" : ""} ${dragging ? "dragging" : ""} ${controlsVisible ? "selected" : ""}`}
      data-motion-paused={hidden || dragging}
      data-size={preferences.size}
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: { small: 148, medium: 188, large: 228 }[preferences.size],
        height: { small: 244, medium: 298, large: 352 }[preferences.size],
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setControlsVisible(false);
          catButton.current?.focus();
        }
      }}
    >
      {voicePanel}
      <div className="pet-status-slot" id="pet-activity-status" role="status" aria-atomic="true">
        {status && (
          <button
            type="button"
            onClick={openChat}
            tabIndex={panelOpen ? -1 : 0}
            className={voicePanel ? "sr-only" : "pet-bubble"}
            title={detail || PET_ACTIVITIES[activity].description}
          >
            {status}
            {activity === "error" && detail && <span className="sr-only">. {detail}</span>}
          </button>
        )}
      </div>
      <button
        type="button"
        className="pet-button"
        ref={catButton}
        aria-expanded={controlsVisible}
        aria-controls="pet-model-controls"
        aria-describedby="pet-activity-status"
        onClick={(event) => {
          if (event.detail === 0) setControlsVisible((visible) => !visible);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || pointer.current !== null) return;
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragError("");
          setDragging(true);
          void drag("start");
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId) void drag("move");
        }}
        onPointerUp={(event) => {
          if (pointer.current !== event.pointerId) return;
          pointer.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
          void drag("end").then(({ moved }) => {
            if (!moved) setControlsVisible((visible) => !visible);
          });
        }}
        onLostPointerCapture={() => {
          if (pointer.current === null) return;
          pointer.current = null;
          setDragging(false);
          void drag("cancel");
        }}
        aria-label="Show cat controls"
        title="Click for controls; drag to move"
      >
        <PetArtwork activity={activity} />
      </button>
      <div id="pet-controls" className="pet-dock">
        <button type="button" className="xp-button pet-chat" onClick={() => act(openChat)}>
          Chat
        </button>
        <button
          type="button"
          className="xp-button pet-options"
          onClick={() => act(openOptions)}
          aria-label="Cat options"
          title="Cat options"
        >
          ⋯
        </button>
        <button
          type="button"
          className="xp-button pet-talk"
          onClick={() => act(talk)}
          disabled={snapshot.busy || voiceBusy}
          title={
            voice.availability === "preparing"
              ? "Voice is preparing in the background"
              : `Talk to your cat${talkShortcut ? ` · ${talkShortcut}` : ""}`
          }
        >
          <svg width="11" height="13" viewBox="0 0 12 16" aria-hidden="true" className="mic-icon">
            <rect x="4" y="1" width="4" height="8" rx="2" fill="currentColor" />
            <path
              d="M2 7v1a4 4 0 0 0 8 0V7M6 12v3M3 15h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>{" "}
          Talk
        </button>
        {(snapshot.busy || voiceBusy) && (
          <button
            type="button"
            className="xp-button pet-stop"
            onClick={() => act(stop)}
            aria-label="Stop reply"
          >
            Stop
          </button>
        )}
      </div>
      <button
        type="button"
        className="xp-button pet-model"
        id="pet-model-controls"
        style={{ visibility: controlsVisible ? "visible" : "hidden" }}
        onClick={() => act(openModels)}
        aria-label="Choose model"
        title={`Change model: ${modelLabel}`}
      >
        {modelLabel} ▾
      </button>
    </main>
  );
}
