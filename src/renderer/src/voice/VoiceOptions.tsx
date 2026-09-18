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
  async function run(task: Promise<VoiceResult>) {
    setError("");
    try {
      const r = await task;
      if (!r.ok) setError(voiceMessages[r.code]);
    } catch {
      setError("Could not complete that voice action.");
    }
  }
  const installed = state.installed?.includes(draft.modelId);
  const download = state.download;
  return (
    <>
      <fieldset disabled={disabled}>
        <legend>Local speech input</legend>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
          />
          Enable voice input
        </label>
        <label className="voice-option">
          Speech model
          <select
            value={draft.modelId}
            onChange={(e) =>
              onChange({
                ...draft,
                modelId: e.target.value as VoiceSettings["modelId"],
                language: e.target.value === "base.en" ? "en" : draft.language,
              })
            }
          >
            <option value="large-v3-turbo">Turbo · 1.51 GiB · multilingual</option>
            <option value="base.en">Base English · 141 MiB · smaller</option>
          </select>
        </label>
        <label className="voice-option">
          Language
          <select
            value={draft.language}
            onChange={(e) =>
              onChange({ ...draft, language: e.target.value as VoiceSettings["language"] })
            }
          >
            <option value="en">English</option>
            <option value="auto" disabled={draft.modelId === "base.en"}>
              Detect automatically
            </option>
          </select>
        </label>
        <label className="voice-option">
          Acceleration
          <select
            value={draft.backend}
            onChange={(e) =>
              onChange({ ...draft, backend: e.target.value as VoiceSettings["backend"] })
            }
          >
            <option value="auto">Auto (CPU in this build)</option>
            <option value="cpu">CPU</option>
          </select>
        </label>
        <label className="voice-option">
          Microphone
          <select
            value={draft.inputDeviceId ?? ""}
            onChange={(e) => {
              const next = { ...draft };
              if (e.target.value) next.inputDeviceId = e.target.value;
              else delete next.inputDeviceId;
              onChange(next);
            }}
          >
            <option value="">Windows default</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="xp-button"
          onClick={() =>
            void navigator.mediaDevices
              .enumerateDevices()
              .then((all) =>
                setDevices(
                  all.filter(
                    (d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default",
                  ),
                ),
              )
              .catch(() => setError("Microphones could not be listed."))
          }
        >
          Refresh microphones
        </button>
      </fieldset>
      <div className="voice-assets">
        <span className="voice-install-status">
          {installed ? "Model installed" : "Model not installed"} · includes 865 KiB speech detector
        </span>
        {download ? (
          <>
            <progress
              value={download.received}
              max={download.total || 1}
              aria-label="Speech model download"
            />
            <button
              type="button"
              className="xp-button"
              onClick={() =>
                void run(window.computerCat.voiceCancelDownload({ downloadId: download.id }))
              }
            >
              Cancel download
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="xp-button"
              disabled={disabled || installed}
              onClick={() =>
                void run(window.computerCat.voiceDownloadModel({ modelId: draft.modelId }))
              }
            >
              Download model
            </button>
            <button
              type="button"
              className="xp-button"
              disabled={disabled || !installed}
              onClick={() =>
                void run(window.computerCat.voiceRemoveModel({ modelId: draft.modelId }))
              }
            >
              Remove model
            </button>
          </>
        )}
      </div>
      <p className="option-note">
        Download and Remove take effect immediately. Enabling voice does not start the microphone.
        Speech is transcribed on this computer. Sending the text uses your selected connection.
      </p>
      {(error || state.error) && (
        <p role="alert" className="dialog-error">
          {error || (state.error && voiceMessages[state.error])}
        </p>
      )}
    </>
  );
}
