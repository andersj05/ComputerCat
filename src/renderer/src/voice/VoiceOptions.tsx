import { useState } from "react";
import {
  type VoiceResult,
  type VoiceSettings,
  type VoiceSnapshot,
  voiceMessages,
} from "../../../shared/voice";

export function VoiceOptions({
  draft,
  onChange,
  state,
  disabled,
}: {
  draft: VoiceSettings;
  onChange: (value: VoiceSettings) => void;
  state: VoiceSnapshot;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [refreshed, setRefreshed] = useState(false);
  const [acting, setActing] = useState(false);
  async function run(task: () => Promise<VoiceResult>) {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      const result = await task();
      if (!result.ok) setError(voiceMessages[result.code]);
    } catch {
      setError("Could not complete that voice action.");
    } finally {
      setActing(false);
    }
  }
  const installed = state.installed?.includes(draft.modelId);
  const download = state.download;
  const missingDevice =
    draft.inputDeviceId && !devices.some((d) => d.deviceId === draft.inputDeviceId);
  const downloadPercent = download?.total
    ? Math.min(100, Math.floor((download.received / download.total) * 100))
    : 0;

  return (
    <div className="voice-options">
      <fieldset disabled={disabled || acting}>
        <legend>1. Speech model</legend>
        <label className="voice-option">
          Speech model
          <select
            value={draft.modelId}
            disabled={Boolean(download)}
            aria-describedby="speech-model-help"
            onChange={(event) =>
              onChange({
                ...draft,
                modelId: event.target.value as VoiceSettings["modelId"],
                language: event.target.value === "base.en" ? "en" : draft.language,
              })
            }
          >
            <option value="large-v3-turbo">Turbo · 1.51 GiB · multilingual</option>
            <option value="base.en">Base English · 141 MiB · smaller</option>
          </select>
        </label>
        <p className="field-help" id="speech-model-help">
          {draft.modelId === "base.en"
            ? "A smaller, faster option for English."
            : "Supports multiple languages. Can be slow on this computer; Base English is smaller and faster."}
        </p>
        <div className="voice-assets">
          <span className="voice-install-status" role="status">
            <span
              className={`connection-light ${installed ? "connected" : ""}`}
              aria-hidden="true"
            />
            {installed ? "Installed on this computer" : "Download needed before you can Talk"}
          </span>
          {download ? (
            <>
              <label className="download-progress">
                Downloading {download.modelId === "base.en" ? "Base English" : "Turbo"} ·{" "}
                {downloadPercent}%
                <progress
                  value={download.received}
                  max={download.total || 1}
                  aria-label="Speech model download"
                />
              </label>
              <button
                type="button"
                className="xp-button"
                onClick={() =>
                  void run(() =>
                    window.computerCat.voiceCancelDownload({ downloadId: download.id }),
                  )
                }
              >
                Cancel download
              </button>
            </>
          ) : installed ? (
            <button
              type="button"
              className="xp-button"
              onClick={() =>
                void run(() => window.computerCat.voiceRemoveModel({ modelId: draft.modelId }))
              }
            >
              Remove model
            </button>
          ) : (
            <button
              type="button"
              className="xp-button"
              onClick={() =>
                void run(() => window.computerCat.voiceDownloadModel({ modelId: draft.modelId }))
              }
            >
              Download model
            </button>
          )}
        </div>
        <p className="field-help">
          Download and Remove take effect immediately. Downloads include a small speech detector.
        </p>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>2. Voice input</legend>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
          />
          <span>Enable voice input</span>
        </label>
        <label className="voice-option">
          Language
          <select
            value={draft.language}
            onChange={(event) =>
              onChange({ ...draft, language: event.target.value as VoiceSettings["language"] })
            }
          >
            <option value="en">English</option>
            <option value="auto" disabled={draft.modelId === "base.en"}>
              Detect automatically
            </option>
          </select>
        </label>
        <p className="field-help">
          Apply or OK saves your choices. Your microphone starts only when you click Talk.
        </p>
      </fieldset>
      <details className="voice-advanced">
        <summary>Microphone &amp; performance</summary>
        <fieldset disabled={disabled}>
          <legend>Recording options</legend>
          <label className="voice-option">
            Microphone
            <select
              value={draft.inputDeviceId ?? ""}
              onChange={(event) => {
                const next = { ...draft };
                if (event.target.value) next.inputDeviceId = event.target.value;
                else delete next.inputDeviceId;
                onChange(next);
              }}
            >
              <option value="">Windows default</option>
              {missingDevice && (
                <option value={draft.inputDeviceId}>
                  {refreshed ? "Saved microphone (not listed)" : "Saved microphone"}
                </option>
              )}
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="xp-button"
            onClick={() => {
              setError("");
              void navigator.mediaDevices
                .enumerateDevices()
                .then((all) => {
                  setDevices(
                    all.filter(
                      (device) =>
                        device.kind === "audioinput" &&
                        device.deviceId &&
                        device.deviceId !== "default",
                    ),
                  );
                  setRefreshed(true);
                })
                .catch(() => setError("Microphones could not be listed."));
            }}
          >
            Refresh microphones
          </button>
          <p className="field-help">Microphone names may appear after your first recording.</p>
          <label className="voice-option">
            Acceleration
            <select
              value={draft.backend}
              onChange={(event) =>
                onChange({ ...draft, backend: event.target.value as VoiceSettings["backend"] })
              }
            >
              <option value="auto">Auto (recommended)</option>
              <option value="cpu">CPU</option>
              {draft.backend === "cuda" && (
                <option value="cuda" disabled>
                  CUDA (unavailable in this build)
                </option>
              )}
            </select>
          </label>
          <p className="field-help">Auto chooses the available CPU helper.</p>
        </fieldset>
      </details>
      <p className="option-note">
        Speech is transcribed on this computer. Review the text before sending it with your chat's
        selected model.
      </p>
      {(error || state.error) && (
        <p role="alert" className="connection-error">
          {error || (state.error && voiceMessages[state.error])}
        </p>
      )}
    </div>
  );
}
