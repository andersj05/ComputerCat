import catImage from "../../../assets/computer_cat.png";
import type { ChatSnapshot, PetPreferences } from "../../shared/contracts";
import { Icon } from "./Icon";

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
    ? "Let's try again."
    : snapshot.busy
      ? "Thinking of a reply…"
      : lastReply?.state === "error"
        ? "Let's try that again."
        : lastReply?.state === "stopped"
          ? "Here when you're ready."
          : lastReply
            ? "Ready when you are."
            : "Need a little help?";
  return (
    <main
      className={`pet-wrap ${preferences.animation ? "animated" : ""} ${snapshot.busy ? "working" : ""}`}
    >
      <div className="pet-bubble" role="status">
        {status}
      </div>
      <button
        type="button"
        className="pet-button"
        onClick={openChat}
        aria-label="Open Computer Cat chat"
        title="Click to chat"
      >
        <img src={catImage} alt="Your pixel cat in a little cowboy hat" draggable="false" />
      </button>
      <div className="pet-dock">
        <div className="pet-handle" title="Drag to move your cat">
          <span aria-hidden="true">⠿</span>
          <span>drag me</span>
        </div>
        {snapshot.busy && (
          <button type="button" className="pet-stop" onClick={stop} aria-label="Stop reply">
            <Icon name="stop" />
            Stop
          </button>
        )}
      </div>
    </main>
  );
}
