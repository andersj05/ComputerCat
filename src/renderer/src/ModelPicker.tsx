import { useEffect, useRef, useState } from "react";
import type { ModelSettings, ModelState, ReasoningLevel } from "../../shared/models";
import { WindowCaption } from "./WindowCaption";

export function ModelControls({
  state,
  busy,
  onConnections,
}: {
  state: ModelState | undefined;
  busy: boolean;
  onConnections: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const active = state?.active;
  const model = state?.models.find((entry) => entry.id === active?.codexModel);
  const value =
    active?.source === "codex" ? `codex:${active.codexModel}` : (active?.source ?? "demo");
  async function select(settings: ModelSettings) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await window.computerCat.selectModel(settings);
      if (!result.ok) setError(result.message);
    } catch {
      setError("Couldn't change the model. Please try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="model-picker">
      <div className="quick-model-row">
        <label>
          Model:
          <select
            aria-label="Chat model"
            value={value}
            disabled={!state || busy || saving}
            onChange={(event) => {
              if (!active) return;
              const value = event.target.value;
              if (value.startsWith("codex:")) {
                const selected = state?.models.find((entry) => entry.id === value.slice(6));
                if (selected)
                  void select({
                    ...active,
                    source: "codex",
                    codexModel: selected.id,
                    reasoning: selected.reasoning.includes(active.reasoning)
                      ? active.reasoning
                      : selected.reasoning.includes("medium")
                        ? "medium"
                        : (selected.reasoning[0] ?? "off"),
                  });
              } else void select({ ...active, source: value as ModelSettings["source"] });
            }}
          >
            <option value="demo">Local demo</option>
            {state?.environment.configured && (
              <option value="environment">{state.environment.model} (API)</option>
            )}
            {state?.models.length ? (
              <optgroup
                label={
                  state.codex.connected
                    ? "Codex subscription"
                    : "Codex — sign in through Connections"
                }
              >
                {state.models.map((entry) => (
                  <option
                    key={entry.id}
                    value={`codex:${entry.id}`}
                    disabled={!state.codex.connected}
                  >
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {active?.source === "codex" && !model && (
              <option value={value}>Unavailable: {active.codexModel}</option>
            )}
          </select>
        </label>
        {active?.source === "codex" && (
          <label>
            Reasoning:
            <select
              aria-label="Chat reasoning"
              value={active.reasoning}
              disabled={busy || saving}
              onChange={(event) =>
                void select({ ...active, reasoning: event.target.value as ReasoningLevel })
              }
            >
              {model?.reasoning.map((level) => (
                <option key={level} value={level}>
                  {level === "xhigh" ? "Extra high" : level[0]?.toUpperCase() + level.slice(1)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="xp-button" onClick={onConnections}>
          Connections…
        </button>
      </div>
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ModelPickerDialog({
  state,
  busy,
  onClose,
  onConnections,
}: {
  state: ModelState | undefined;
  busy: boolean;
  onClose: () => void;
  onConnections: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="xp-dialog model-dialog"
      aria-labelledby="model-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <WindowCaption title="Choose model" titleId="model-picker-title" onClose={onClose} />
      <div className="model-dialog-content">
        <ModelControls state={state} busy={busy} onConnections={onConnections} />
        <p className="option-note">
          Changes apply to this conversation's next reply. Your chat stays intact.
        </p>
      </div>
      <div className="dialog-actions">
        <button className="xp-button" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
