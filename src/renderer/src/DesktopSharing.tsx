import { useEffect, useRef, useState } from "react";
import type { DesktopState } from "../../shared/desktop";
import { WindowCaption } from "./WindowCaption";

export function useDesktopSharing() {
  const [state, setState] = useState<DesktopState>({ enabled: false, busy: false });
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const changing = useRef(false);
  const observedGeneration = useRef(0);
  const latestState = useRef(state);
  useEffect(() => {
    let active = true;
    let received = false;
    const unsubscribe = window.computerCat.onDesktopChanged((next) => {
      received = true;
      observedGeneration.current++;
      latestState.current = next;
      setState(next);
      setReady(true);
      setError("");
    });
    void window.computerCat.desktopSnapshot().then(
      (next) => {
        if (!active) return;
        if (!received) {
          latestState.current = next;
          setState(next);
        }
        setReady(true);
      },
      () => {
        if (active) setError("Couldn't check screen sharing. Please restart the app.");
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function setEnabled(enabled: boolean) {
    if (changing.current) return false;
    changing.current = true;
    setPending(true);
    setError("");
    const startedGeneration = observedGeneration.current;
    try {
      const next = await window.computerCat.desktopSetEnabled({ enabled });
      // A lock, context switch, or another window can revoke sharing before this reply arrives.
      // Broadcasts observed after the request started take precedence over its older snapshot.
      if (observedGeneration.current === startedGeneration) {
        latestState.current = next;
        setState(next);
      }
      if (latestState.current.enabled !== enabled || next.error) {
        setError(next.error || "Couldn't change screen sharing. Try again.");
        return false;
      }
      return true;
    } catch {
      setError("Couldn't change screen sharing. Try again.");
      return false;
    } finally {
      changing.current = false;
      setPending(false);
    }
  }

  return { state, ready, pending, error: error || state.error || "", setEnabled };
}

export type DesktopSharing = ReturnType<typeof useDesktopSharing>;

export function DesktopSharingButton({
  sharing,
  onOpen,
  className = "xp-button",
}: {
  sharing: DesktopSharing;
  onOpen: () => void;
  className?: string;
}) {
  const { state, ready, pending, setEnabled } = sharing;
  return (
    <button
      type="button"
      className={`${className} desktop-sharing-button ${state.enabled ? "sharing-enabled" : ""}`}
      disabled={!ready || pending}
      onClick={() => (state.enabled ? void setEnabled(false) : onOpen())}
      title={
        state.enabled
          ? state.busy
            ? "Reading screen. Stop sharing to cancel access."
            : "Screen sharing is on. Stop access to new desktop context."
          : "Let Computer Cat read your screen when you ask for help"
      }
    >
      {state.enabled && <span className="sharing-light" aria-hidden="true" />}
      {pending ? "Updating…" : state.enabled ? "Stop sharing" : "Share screen…"}
    </button>
  );
}

export function DesktopSharingDialog({
  sharing,
  onClose,
}: {
  sharing: DesktopSharing;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => dialog.current?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="xp-dialog desktop-sharing-dialog"
      aria-labelledby="desktop-sharing-title"
      aria-describedby="desktop-sharing-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!sharing.pending) onClose();
      }}
    >
      <WindowCaption
        title="Share your screen"
        titleId="desktop-sharing-title"
        onClose={onClose}
        disabled={sharing.pending}
      />
      <div className="desktop-sharing-content" id="desktop-sharing-description">
        <p>Let Computer Cat look at your desktop when you ask for help.</p>
        <ul>
          <li>Take screenshots and see open windows and their titles.</li>
          <li>Read app text, browser tabs, and selected text that apps make available.</li>
        </ul>
        <p>
          This can include private information. Captured content can go to the selected model and
          remain in this chat's local model context until you delete the conversation.
        </p>
        <p>
          Sharing allows on-demand reads, without clicking or typing. It ends when you stop sharing,
          change chats or models, lock your computer, or quit the app.
        </p>
        {sharing.error && (
          <p className="connection-error" role="alert">
            {sharing.error}
          </p>
        )}
      </div>
      <div className="dialog-actions">
        <button
          ref={cancel}
          type="button"
          className="xp-button"
          disabled={sharing.pending}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="xp-button"
          disabled={!sharing.ready || sharing.pending}
          onClick={() => {
            void sharing.setEnabled(true).then((enabled) => {
              if (enabled) onClose();
            });
          }}
        >
          {sharing.pending ? "Starting…" : "Start sharing"}
        </button>
      </div>
    </dialog>
  );
}
