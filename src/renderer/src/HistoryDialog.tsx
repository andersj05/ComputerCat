import { useEffect, useRef, useState } from "react";
import type { ActionResult, ConversationSummary } from "../../shared/contracts";
import { WindowCaption } from "./WindowCaption";

export function HistoryDialog({
  currentId,
  onOpen,
  onClose,
  onDeleted,
}: {
  currentId: string | undefined;
  onOpen: (id: string) => Promise<ActionResult>;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState(currentId ?? "");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    dialog.current?.showModal();
    void window.computerCat
      .conversations()
      .then((items) => {
        if (active) {
          setItems(items);
          setSelected((selected) =>
            items.some((item) => item.id === selected) ? selected : (items[0]?.id ?? ""),
          );
        }
      })
      .catch(() => {
        if (active) setError("Couldn't load saved conversations. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      dialog.current?.close();
    };
  }, []);
  const visible = items.filter((item) =>
    item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const chosen = visible.find((item) => item.id === selected);
  async function action(remove: boolean) {
    if (!chosen || pending.current) return;
    pending.current = true;
    setActing(true);
    setError("");
    try {
      const result = remove
        ? await window.computerCat.deleteConversation(chosen.id)
        : await onOpen(chosen.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (!remove) {
        onClose();
        return;
      }
      onDeleted(chosen.id);
      const remaining = items.filter((item) => item.id !== chosen.id);
      setItems(remaining);
      setSelected(remaining[0]?.id ?? "");
      setConfirmDelete(false);
    } catch {
      setError("Couldn't update this conversation. Please try again.");
    } finally {
      pending.current = false;
      setActing(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="xp-dialog history-dialog"
      aria-labelledby="history-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!acting) {
          if (confirmDelete) setConfirmDelete(false);
          else onClose();
        }
      }}
    >
      <WindowCaption
        title="Conversation history"
        titleId="history-title"
        onClose={onClose}
        disabled={acting}
      />
      <div className="history-content">
        <label className="history-search">
          Find a conversation:
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setConfirmDelete(false);
            }}
            disabled={acting}
          />
        </label>
        <section className="history-list" aria-label="Saved conversations">
          {loading ? (
            <p>Loading conversations…</p>
          ) : visible.length === 0 ? (
            <p>
              {query
                ? "No matching conversations."
                : "Your conversations will appear here after your first message."}
            </p>
          ) : (
            visible.map((item) => (
              <button
                type="button"
                className={`history-item${selected === item.id ? " selected" : ""}`}
                key={item.id}
                disabled={acting}
                aria-pressed={selected === item.id}
                onClick={() => {
                  setSelected(item.id);
                  setConfirmDelete(false);
                }}
              >
                <strong>
                  {item.title}
                  {item.id === currentId ? " (current)" : ""}
                </strong>
                <span className="history-meta">
                  {new Date(item.updatedAt).toLocaleString()} · {item.messageCount} messages ·{" "}
                  {item.model.source === "codex"
                    ? item.model.codexModel
                    : item.model.source === "demo"
                      ? "Local demo"
                      : "API connection"}
                </span>
              </button>
            ))
          )}
        </section>
        {confirmDelete && (
          <div className="delete-confirmation" role="alert">
            <p>
              Delete “{chosen?.title}” from this computer? This removes its saved chat. Files
              changed by the agent stay on your computer.
            </p>
            <button
              type="button"
              className="xp-button"
              disabled={acting}
              onClick={() => setConfirmDelete(false)}
            >
              Keep conversation
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={acting}
              onClick={() => void action(true)}
            >
              Delete permanently
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="connection-error">
            {error}
          </p>
        )}
        <p className="option-note">Saved locally on this computer until you delete them.</p>
      </div>
      <div className="dialog-actions">
        <button
          type="button"
          className="xp-button"
          disabled={acting || !chosen || loading}
          onClick={() => setConfirmDelete(true)}
        >
          Delete…
        </button>
        <button type="button" className="xp-button" disabled={acting} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="xp-button default-button"
          disabled={acting || !chosen || loading || confirmDelete}
          onClick={() => void action(false)}
        >
          Open conversation
        </button>
      </div>
    </dialog>
  );
}
