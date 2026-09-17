import { useRef, useState } from "react";
import type { ChatSnapshot, PetPreferences } from "../../shared/contracts";
import { PetArtwork } from "./PetArtwork";

export function Pet({
  snapshot,
  preferences,
  error,
  openChat,
  openOptions,
  stop,
}: {
  snapshot: ChatSnapshot;
  preferences: PetPreferences;
  error: string;
  openChat: () => void;
  openOptions: () => void;
  stop: () => void;
}) {
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
    error || dragError
      ? error || dragError
      : snapshot.busy
        ? "Thinking…"
        : lastReply?.state === "error"
          ? "Reply interrupted."
          : "";
  return (
    <main
      className={`pet-wrap ${preferences.animation ? "animated" : ""} ${snapshot.busy ? "working" : ""} ${dragging ? "dragging" : ""}`}
    >
      <div className="pet-status-slot" role="status">
        {status && (
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
        onClick={(event) => {
          if (event.detail === 0) openChat();
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
            if (!moved) openChat();
          });
        }}
        onLostPointerCapture={() => {
          if (pointer.current === null) return;
          pointer.current = null;
          setDragging(false);
          void drag("cancel");
        }}
        aria-label="Open Computer Cat chat"
        title="Click to chat · Drag to move"
      >
        <PetArtwork />
      </button>
      <div className="pet-dock">
        <div className="pet-handle" title="Drag to move your cat">
          <span aria-hidden="true" />
        </div>
        <button type="button" className="xp-button pet-chat" onClick={openChat}>
          Chat
        </button>
        <button
          type="button"
          className="xp-button pet-options"
          onClick={openOptions}
          aria-label="Cat options"
          title="Cat options"
        >
          ⋯
        </button>
        {snapshot.busy && (
          <button
            type="button"
            className="xp-button pet-stop"
            onClick={stop}
            aria-label="Stop reply"
          >
            Stop
          </button>
        )}
      </div>
    </main>
  );
}
