import { useEffect, useRef, useState } from "react";
import catImage from "../../../assets/computer_cat.png";
import type { ActionResult, AppInfo, PetPreferences } from "../../shared/contracts";
import { WindowCaption } from "./WindowCaption";

export function OptionsDialog({
  info,
  preferences,
  onApply,
  onClose,
  onShowPet,
  onQuit,
}: {
  info: AppInfo | undefined;
  preferences: PetPreferences;
  onApply: (preferences: PetPreferences) => Promise<ActionResult>;
  onClose: () => void;
  onShowPet: () => Promise<void>;
  onQuit: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"cat" | "general">("cat");
  const [draft, setDraft] = useState(preferences);
  const [saved, setSaved] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const catTab = useRef<HTMLButtonElement>(null);
  const generalTab = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const dirty =
    draft.size !== saved.size ||
    draft.animation !== saved.animation ||
    draft.alwaysOnTop !== saved.alwaysOnTop;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    catTab.current?.focus();
    return () => element?.close();
  }, []);

  async function apply(closeAfter: boolean) {
    if (pending.current) return;
    if (!dirty) {
      if (closeAfter) onClose();
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await onApply(draft);
      if (result.ok) {
        setSaved(draft);
        if (closeAfter) onClose();
      } else setError(result.message);
    } catch {
      setError("Couldn't save these settings. Try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function action(run: () => Promise<void>, failure: string) {
    setError("");
    try {
      await run();
    } catch {
      setError(failure);
    }
  }

  function selectTab(next: "cat" | "general") {
    setTab(next);
    (next === "cat" ? catTab : generalTab).current?.focus();
  }

  return (
    <dialog
      className="xp-dialog options-dialog"
      ref={dialog}
      aria-labelledby="options-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <WindowCaption title="Options" titleId="options-title" onClose={onClose} disabled={saving} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply(true);
        }}
      >
        <div className="property-sheet">
          <div
            className="tabs"
            role="tablist"
            aria-label="Options"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                selectTab(tab === "cat" ? "general" : "cat");
              }
              if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                selectTab(event.key === "Home" ? "cat" : "general");
              }
            }}
          >
            <button
              type="button"
              role="tab"
              ref={catTab}
              id="cat-tab"
              aria-controls="cat-options"
              aria-selected={tab === "cat"}
              tabIndex={tab === "cat" ? 0 : -1}
              onClick={() => setTab("cat")}
            >
              Desktop cat
            </button>
            <button
              type="button"
              role="tab"
              ref={generalTab}
              id="general-tab"
              aria-controls="general-options"
              aria-selected={tab === "general"}
              tabIndex={tab === "general" ? 0 : -1}
              onClick={() => setTab("general")}
            >
              General
            </button>
          </div>
          <div
            className="tab-panel"
            role="tabpanel"
            id="cat-options"
            aria-labelledby="cat-tab"
            hidden={tab !== "cat"}
          >
            <div className="cat-options-layout">
              <div className="cat-preview">
                <div className="preview-surface">
                  <img src={catImage} alt="Desktop cat preview" draggable="false" />
                </div>
                <button
                  type="button"
                  className="xp-button"
                  onClick={() => void action(onShowPet, "Couldn't show your cat.")}
                >
                  Find cat
                </button>
              </div>
              <div className="cat-fields">
                <fieldset disabled={saving || !info}>
                  <legend>Size</legend>
                  <div className="size-options">
                    {(["small", "medium", "large"] as const).map((size) => (
                      <label key={size} className="check-label">
                        <input
                          type="radio"
                          name="pet-size"
                          checked={draft.size === size}
                          onChange={() => setDraft({ ...draft, size })}
                        />
                        <span>
                          {size === "small" ? "Small" : size === "medium" ? "Medium" : "Large"}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset disabled={saving || !info}>
                  <legend>Behavior</legend>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={draft.alwaysOnTop}
                      onChange={(event) =>
                        setDraft({ ...draft, alwaysOnTop: event.target.checked })
                      }
                    />
                    <span>Always on top</span>
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={draft.animation}
                      onChange={(event) => setDraft({ ...draft, animation: event.target.checked })}
                    />
                    <span>Animate cat</span>
                  </label>
                </fieldset>
              </div>
            </div>
            <p className="option-note">Drag the grip beneath your cat to move it.</p>
          </div>
          <div
            className="tab-panel"
            role="tabpanel"
            id="general-options"
            aria-labelledby="general-tab"
            hidden={tab !== "general"}
          >
            <fieldset>
              <legend>Conversation</legend>
              <dl className="property-list">
                <dt>Mode:</dt>
                <dd>
                  {!info
                    ? "Loading…"
                    : info.mode === "demo"
                      ? "Local demo"
                      : info.configured
                        ? "Configured model"
                        : "Model setup needed"}
                </dd>
                {info?.mode === "pi" && (
                  <>
                    <dt>Model:</dt>
                    <dd>{info.model ?? "Not configured"}</dd>
                  </>
                )}
                <dt>History:</dt>
                <dd>This session only</dd>
                <dt>Screen access:</dt>
                <dd>Off</dd>
              </dl>
              {info?.mode === "demo" && (
                <p className="option-note">Sample replies. No API calls.</p>
              )}
            </fieldset>
            <fieldset>
              <legend>Shortcuts</legend>
              <dl className="property-list shortcuts">
                <dt>Open chat:</dt>
                <dd>{info?.shortcut ?? "Loading…"}</dd>
                <dt>Stop reply:</dt>
                <dd>{info?.stopShortcut ?? "Loading…"}</dd>
              </dl>
            </fieldset>
            <div className="about-row">
              <span>Computer Cat {info?.version ?? ""}</span>
              <button
                type="button"
                className="xp-button"
                disabled={saving}
                onClick={() => void action(onQuit, "Couldn't exit Computer Cat.")}
              >
                Exit Computer Cat
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <span className="save-status" role="status">
            {saving ? "Saving…" : ""}
          </span>
          <button type="submit" className="xp-button default-button" disabled={saving}>
            OK
          </button>
          <button type="button" className="xp-button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="xp-button"
            disabled={!dirty || saving || !info}
            onClick={() => void apply(false)}
          >
            Apply
          </button>
        </div>
      </form>
    </dialog>
  );
}
