import type { PetPreferences } from "../../shared/contracts";
import { CatScene } from "./CatScene";
import { Icon } from "./Icon";

export function CompanionSettings({
  preferences,
  saving,
  update,
  showPet,
  desktop,
}: {
  preferences: PetPreferences;
  saving: boolean;
  update: (patch: Partial<PetPreferences>) => void;
  showPet: () => void;
  desktop: () => void;
}) {
  return (
    <section className="page-content companion-page" aria-labelledby="companion-heading">
      <span className="eyebrow">A FRIEND FOR YOUR DESKTOP</span>
      <h1 id="companion-heading">Make yourself at home.</h1>
      <p className="page-intro">A little sidekick, right where you need one.</p>
      <div className="companion-layout">
        <div className="companion-preview">
          <div className="inset-frame">
            <CatScene animation={preferences.animation} />
          </div>
          <div className="preview-label">
            <span className="status-dot" />
            Computer Cat<span>Desktop companion</span>
          </div>
          <p>Click your cat to chat. Drag the little handle to find the perfect spot.</p>
          <button type="button" className="xp-button find-cat" onClick={showPet}>
            <Icon name="cat" />
            Find my cat
          </button>
        </div>
        <div className="companion-options">
          <fieldset className="size-options" disabled={saving}>
            <legend>Just the right size</legend>
            <p>Make room for your little friend.</p>
            <div className="size-choices">
              {(["small", "medium", "large"] as const).map((size) => (
                <label
                  key={size}
                  className={`size-choice ${preferences.size === size ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="pet-size"
                    value={size}
                    checked={preferences.size === size}
                    onChange={() => update({ size })}
                  />
                  <Icon name="cat" className={`size-icon ${size}`} />
                  <span>{size === "small" ? "Small" : size === "medium" ? "Medium" : "Large"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="toggle-row">
            <span>
              <strong>Keep cat on top</strong>
              <small>Stay visible above your other windows.</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.alwaysOnTop}
              disabled={saving}
              onChange={(event) => update({ alwaysOnTop: event.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>A little animation</strong>
              <small>A gentle idle bounce. Respects reduced motion.</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.animation}
              disabled={saving}
              onChange={(event) => update({ animation: event.target.checked })}
            />
          </label>
          <p className="saved-note" role="status">
            <Icon name="check" />
            {saving ? "Saving your setting…" : "Settings save automatically on this computer."}
          </p>
        </div>
      </div>
      <div className="desktop-callout">
        <span className="feature-icon green">
          <Icon name="desktop" />
        </span>
        <div>
          <strong>Small window. Good company.</strong>
          <p>Put chat away and let your cat keep you company.</p>
        </div>
        <button type="button" className="xp-button primary" onClick={desktop}>
          Desktop mode
          <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}
