import { useEffect, useRef, useState } from "react";
import type { ActionResult, AppInfo, PetPreferences } from "../../shared/contracts";
import { DEFAULT_MODEL_SETTINGS } from "../../shared/models";
import { DEFAULT_VOICE, type VoiceSnapshot, voiceMessages } from "../../shared/voice";
import { ModelOptions } from "./ModelOptions";
import { PetArtwork } from "./PetArtwork";
import { VoiceOptions } from "./voice/VoiceOptions";
import { WindowCaption } from "./WindowCaption";

const optionTabs = ["cat", "models", "voice", "general"] as const;
type OptionTab = (typeof optionTabs)[number];

export function OptionsDialog({
  info,
  preferences,
  voice,
  onApply,
  onClose,
  onShowPet,
  onQuit,
  busy,
  initialTab = "cat",
}: {
  info: AppInfo | undefined;
  preferences: PetPreferences;
  voice: VoiceSnapshot;
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
  const [draftVoice, setDraftVoice] = useState(voice.settings ?? DEFAULT_VOICE);
  const [savedVoice, setSavedVoice] = useState(draftVoice);
  const voiceTab = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const catTab = useRef<HTMLButtonElement>(null);
  const generalTab = useRef<HTMLButtonElement>(null);
  const modelsTab = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const loginRef = useRef(info?.models.codex.login);
  loginRef.current = info?.models.codex.login;
  useEffect(
    () => () => {
      const login = loginRef.current;
      if (login)
        void window.computerCat.codexCancel({ attemptId: login.attemptId }).catch(() => {});
    },
    [],
  );
  const dirtyPet =
    draft.size !== saved.size ||
    draft.animation !== saved.animation ||
    draft.alwaysOnTop !== saved.alwaysOnTop;
  const dirtyModels =
    draftModels.source !== savedModels.source ||
    draftModels.codexModel !== savedModels.codexModel ||
    draftModels.reasoning !== savedModels.reasoning;
  const dirtyVoice = JSON.stringify(draftVoice) !== JSON.stringify(savedVoice);
  const dirty = dirtyPet || dirtyModels || dirtyVoice;

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
    ({ cat: catTab, models: modelsTab, voice: voiceTab, general: generalTab })[
      initialTab
    ].current?.focus();
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
    setApplied(false);
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
      if (dirtyVoice) {
        const result = await window.computerCat.voiceUpdateSettings(draftVoice);
        if (!result.ok) {
          setError(
            `${voiceMessages[result.code]}${dirtyPet || dirtyModels ? " Changes to the other tabs were saved." : ""}`,
          );
          return;
        }
        setSavedVoice(draftVoice);
      }
      if (closeAfter) await close();
      else setApplied(true);
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
    ({ cat: catTab, models: modelsTab, voice: voiceTab, general: generalTab })[
      next
    ].current?.focus();
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
                    (optionTabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 3)) % 4
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
              aria-describedby={dirtyPet ? "pending-settings" : undefined}
              tabIndex={tab === "cat" ? 0 : -1}
              onClick={() => setTab("cat")}
            >
              Desktop cat
              {dirtyPet && (
                <span className="tab-dirty" aria-hidden="true">
                  •
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              ref={modelsTab}
              id="models-tab"
              aria-controls="models-options"
              aria-selected={tab === "models"}
              aria-describedby={dirtyModels ? "pending-settings" : undefined}
              tabIndex={tab === "models" ? 0 : -1}
              onClick={() => setTab("models")}
            >
              Models
              {dirtyModels && (
                <span className="tab-dirty" aria-hidden="true">
                  •
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              ref={voiceTab}
              id="voice-tab"
              aria-controls="voice-options"
              aria-selected={tab === "voice"}
              aria-describedby={dirtyVoice ? "pending-settings" : undefined}
              tabIndex={tab === "voice" ? 0 : -1}
              onClick={() => setTab("voice")}
            >
              Voice
              {dirtyVoice && (
                <span className="tab-dirty" aria-hidden="true">
                  •
                </span>
              )}
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
            id="voice-options"
            aria-labelledby="voice-tab"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI tabs pattern makes a panel with introductory content keyboard focusable.
            tabIndex={0}
            hidden={tab !== "voice"}
          >
            <div className="settings-intro">
              <h2>Talk to your cat</h2>
              <p>Set up speech input, then use Talk in chat or on your desktop cat.</p>
            </div>
            <VoiceOptions
              draft={draftVoice}
              onChange={setDraftVoice}
              state={voice}
              disabled={saving}
            />
          </div>
          <div
            className="tab-panel"
            role="tabpanel"
            id="models-options"
            aria-labelledby="models-tab"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI tabs pattern makes a panel with introductory content keyboard focusable.
            tabIndex={0}
            hidden={tab !== "models"}
          >
            <div className="settings-intro">
              <h2>Models &amp; sign-in</h2>
              <p>Connect an account and choose how new conversations start.</p>
            </div>
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
            // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI tabs pattern makes a panel with introductory content keyboard focusable.
            tabIndex={0}
            hidden={tab !== "cat"}
          >
            <div className="settings-intro">
              <h2>Your desktop companion</h2>
              <p>Adjust your cat's appearance and how it behaves on your desktop.</p>
            </div>
            <div className="cat-options-layout">
              <div className="cat-preview">
                <div
                  className={`preview-surface preview-${draft.size} ${draft.animation ? "animated" : ""}`}
                >
                  <PetArtwork />
                </div>
                <span className="preview-label">Preview</span>
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
              Click for controls. Drag to move. Find cat brings it to the screen under your pointer.
            </p>
          </div>
          <div
            className="tab-panel"
            role="tabpanel"
            id="general-options"
            aria-labelledby="general-tab"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI tabs pattern makes a panel with introductory content keyboard focusable.
            tabIndex={0}
            hidden={tab !== "general"}
          >
            <div className="settings-intro">
              <h2>Chat &amp; app information</h2>
              <p>Conversations save locally. Closing chat leaves your cat on the desktop.</p>
            </div>
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
        <span id="pending-settings" className="sr-only">
          Unsaved changes in this tab
        </span>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions settings-actions">
          <span className="save-status" role="status">
            {saving
              ? "Saving changes…"
              : dirty
                ? "Unsaved changes · Apply saves all tabs."
                : applied
                  ? "Changes saved."
                  : "No pending changes."}
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
