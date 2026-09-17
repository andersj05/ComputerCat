import type { AppInfo } from "../../shared/contracts";
import { Icon } from "./Icon";

export function Settings({
  info,
  busy,
  clear,
  quit,
}: {
  info: AppInfo | undefined;
  busy: boolean;
  clear: () => void;
  quit: () => void;
}) {
  const live = info?.mode === "pi";
  return (
    <section className="page-content settings-page" aria-labelledby="settings-heading">
      <span className="eyebrow">THE LITTLE DETAILS</span>
      <h1 id="settings-heading">Simple by nature.</h1>
      <p className="page-intro">Everything you need to know about your companion.</p>
      <div className="settings-group">
        <h2>
          <Icon name="chat" />
          Conversation
        </h2>
        <div className="setting-row">
          <div>
            <strong>
              {live ? (info.configured ? "Configured model" : "Model setup needed") : "Local demo"}
            </strong>
            <p>
              {live
                ? info.configured
                  ? `${info.provider} · ${info.model}`
                  : "Finish model configuration to start a conversation."
                : "A local demo with sample replies. No model is connected."}
            </p>
          </div>
          <span className={`badge ${live && info.configured ? "green" : "amber"}`}>
            {live ? (info.configured ? "Configured" : "Not connected") : "No API calls"}
          </span>
        </div>
        <div className="setting-row">
          <div>
            <strong>Conversation history</strong>
            <p>Just for this app session. Starting a new chat clears the current conversation.</p>
          </div>
          <button type="button" className="xp-button" onClick={clear} disabled={busy}>
            Clear chat
          </button>
        </div>
      </div>
      <div className="settings-group">
        <h2>
          <Icon name="desktop" />
          At your fingertips
        </h2>
        <div className="setting-row">
          <div>
            <strong>Bring chat back</strong>
            <p>You can also click the cat or its tray icon.</p>
          </div>
          <kbd>{info?.shortcut ?? "Loading…"}</kbd>
        </div>
        <div className="setting-row">
          <div>
            <strong>Stop a reply</strong>
            <p>Take a pause whenever you need one.</p>
          </div>
          <kbd>{info?.stopShortcut ?? "Loading…"}</kbd>
        </div>
      </div>
      <div className="privacy-note">
        <Icon name="help" />
        <div>
          <strong>Your desktop is your space.</strong>
          <p>
            Screen & app access is off. Computer Cat can only read what you type here. Screen tools
            and computer actions aren't connected yet.
          </p>
        </div>
      </div>
      <footer className="settings-footer">
        <span>
          Computer Cat <span className="muted">· Version {info?.version ?? "…"}</span>
        </span>
        <button type="button" className="text-button danger" onClick={quit}>
          <Icon name="power" />
          Quit Computer Cat
        </button>
      </footer>
    </section>
  );
}
