import { useEffect, useRef, useState } from "react";
import type { ChatSnapshot, PetPreferences } from "../../shared/contracts";
import { PetArtwork } from "./PetArtwork";

export function Pet({
  snapshot,
  preferences,
  error,
  openChat,
  openOptions,
  openModels,
  modelLabel,
  stop,
  talk,
  voiceStatus,
  voiceBusy,
}: {
  snapshot: ChatSnapshot;
  preferences: PetPreferences;
  error: string;
  openChat: () => void;
  openOptions: () => void;
  openModels: () => void;
  modelLabel: string;
  stop: () => void;
  talk: () => void;
  voiceStatus: string;
  voiceBusy: boolean;
}) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const catButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const hide = () => setControlsVisible(false);
    window.addEventListener("blur", hide);
    return () => window.removeEventListener("blur", hide);
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
  const status =
    error || dragError || voiceStatus
      ? error || dragError || voiceStatus
      : snapshot.busy
        ? "Thinking…"
        : lastReply?.state === "error"
          ? "Reply interrupted."
          : "";
  return (
    <main
      className={`pet-wrap ${preferences.animation ? "animated" : ""} ${snapshot.busy ? "working" : ""} ${dragging ? "dragging" : ""} ${controlsVisible ? "selected" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setControlsVisible(false);
          catButton.current?.focus();
        }
      }}
    >
      <div className="pet-status-slot" role="status">
        {(controlsVisible || voiceBusy) && status && (
          <span className="pet-bubble">
            {snapshot.busy && !error && !dragError && (
              <span className="thinking-dot" aria-hidden="true" />
            )}
            {status}
          </span>
        )}
      </div>
      <button
        type="button"
        className="pet-button"
        ref={catButton}
        aria-expanded={controlsVisible}
        aria-controls="pet-controls"
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
        <PetArtwork />
      </button>
      <div
        id="pet-controls"
        className="pet-dock"
        style={{ visibility: controlsVisible ? "visible" : "hidden" }}
      >
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
        >
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
