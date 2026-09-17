import { useEffect, useRef, useState } from "react";
import type { ActionResult, AppInfo, PetPreferences } from "../../shared/contracts";
import { DEFAULT_MODEL_SETTINGS } from "../../shared/models";
import { ModelOptions } from "./ModelOptions";
import { PetArtwork } from "./PetArtwork";
import { WindowCaption } from "./WindowCaption";

const optionTabs = ["cat", "models", "general"] as const;
type OptionTab = (typeof optionTabs)[number];

export function OptionsDialog({
  info,
  preferences,
  onApply,
  onClose,
  onShowPet,
  onQuit,
  busy,
  initialTab = "cat",
}: {
  info: AppInfo | undefined;
  preferences: PetPreferences;
  onApply: (preferences: PetPreferences) => Promise<ActionResult>;
  onClose: () => void;
  onShowPet: () => Promise<void>;
  onQuit: () => Promise<void>;
  busy: boolean;
  initialTab?: OptionTab;
}) {
  const [tab, setTab] = useState<OptionTab>(initialTab);
  const [draft, setDraft] = useState(preferences);
  const [saved, setSaved] = useState(preferences);
  const [draftModels, setDraftModels] = useState(info?.models.defaults ?? DEFAULT_MODEL_SETTINGS);
  const [savedModels, setSavedModels] = useState(draftModels);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const catTab = useRef<HTMLButtonElement>(null);
  const generalTab = useRef<HTMLButtonElement>(null);
  const modelsTab = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const dirtyPet =
    draft.size !== saved.size ||
    draft.animation !== saved.animation ||
    draft.alwaysOnTop !== saved.alwaysOnTop;
  const dirtyModels =
    draftModels.source !== savedModels.source ||
    draftModels.codexModel !== savedModels.codexModel ||
    draftModels.reasoning !== savedModels.reasoning;
  const dirty = dirtyPet || dirtyModels;

  async function close() {
    if (info?.models.codex.login) {
      try {
        await window.computerCat.codexCancel({ attemptId: info.models.codex.login.attemptId });
      } catch {
        setError("Couldn't cancel sign-in. Please try again.");
        return;
      }
    }
    onClose();
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    ({ cat: catTab, models: modelsTab, general: generalTab })[initialTab].current?.focus();
    return () => element?.close();
  }, [initialTab]);

  async function apply(closeAfter: boolean) {
    if (pending.current) return;
    if (!dirty) {
      if (closeAfter) await close();
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      if (dirtyPet) {
        const result = await onApply(draft);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSaved(draft);
      }
      if (dirtyModels) {
        const result = await window.computerCat.updateModels(draftModels);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSavedModels(draftModels);
      }
      if (closeAfter) await close();
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

  function selectTab(next: OptionTab) {
    setTab(next);
    ({ cat: catTab, models: modelsTab, general: generalTab })[next].current?.focus();
  }

  return (
    <dialog
      className="xp-dialog options-dialog"
      ref={dialog}
      aria-labelledby="options-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) void close();
      }}
    >
      <WindowCaption
        title="Options"
        titleId="options-title"
        onClose={() => void close()}
        disabled={saving}
      />
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
                selectTab(
                  optionTabs[
                    (optionTabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3
                  ] ?? "cat",
                );
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
              ref={modelsTab}
              id="models-tab"
              aria-controls="models-options"
              aria-selected={tab === "models"}
              tabIndex={tab === "models" ? 0 : -1}
              onClick={() => setTab("models")}
            >
              Models
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
            id="models-options"
            aria-labelledby="models-tab"
            hidden={tab !== "models"}
          >
            <ModelOptions
              state={info?.models}
              draft={draftModels}
              onChange={setDraftModels}
              disabled={saving || !info}
              busy={busy}
            />
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
                <div className={`preview-surface ${draft.animation ? "animated" : ""}`}>
                  <PetArtwork />
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
            <p className="option-note">
              Click your cat to chat. Drag it to move. Find cat brings it to this screen.
            </p>
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
                      : info.models.active.source === "codex" && info.configured
                        ? "Codex subscription"
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
                <dd>Saved on this computer</dd>
                <dt>Screen access:</dt>
                <dd>Off</dd>
              </dl>
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
          <button
            type="button"
            className="xp-button"
            disabled={saving}
            onClick={() => void close()}
          >
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
