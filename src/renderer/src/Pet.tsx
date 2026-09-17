import catImage from "../../../assets/computer_cat.png";
import type { ChatSnapshot, PetPreferences } from "../../shared/contracts";

export function Pet({
  snapshot,
  preferences,
  error,
  openChat,
  stop,
}: {
  snapshot: ChatSnapshot;
  preferences: PetPreferences;
  error: string;
  openChat: () => void;
  stop: () => void;
}) {
  const lastReply = snapshot.messages.findLast((message) => message.role === "assistant");
  const status = error
    ? "Couldn't open chat."
    : snapshot.busy
      ? "Thinking…"
      : lastReply?.state === "error"
        ? "Reply interrupted."
        : "";
  return (
    <main
      className={`pet-wrap ${preferences.animation ? "animated" : ""} ${snapshot.busy ? "working" : ""}`}
    >
      <div className="pet-status-slot" role="status">
        {status && <span className="pet-bubble">{status}</span>}
      </div>
      <button
        type="button"
        className="pet-button"
        onClick={openChat}
        aria-label="Open Computer Cat chat"
        title="Open chat"
      >
        <img src={catImage} alt="Computer Cat" draggable="false" />
      </button>
      <div className="pet-dock">
        <div className="pet-handle" title="Drag to move your cat">
          <span aria-hidden="true" />
        </div>
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
