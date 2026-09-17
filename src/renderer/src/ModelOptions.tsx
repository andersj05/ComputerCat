import { useState } from "react";
import type { ActionResult } from "../../shared/contracts";
import type { ModelSettings, ModelState, ReasoningLevel } from "../../shared/models";

export function ModelOptions({
  state,
  draft,
  onChange,
  disabled,
  busy,
}: {
  state: ModelState | undefined;
  draft: ModelSettings;
  onChange: (settings: ModelSettings) => void;
  disabled: boolean;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [callback, setCallback] = useState("");
  const connection = state?.codex;
  const login = connection?.login;
  const selectedModel = state?.models.find((model) => model.id === draft.codexModel);

  async function action(run: () => Promise<ActionResult>) {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      const result = await run();
      if (!result.ok) setError(result.message);
      else setCallback("");
    } catch {
      setError("Couldn't change the connection. Please try again.");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="model-options">
      <fieldset
        disabled={disabled || acting}
        className={connection?.connected ? "account-connected" : undefined}
      >
        <legend>Codex subscription</legend>
        <div className="connection-status">
          <span
            className={`connection-light ${connection?.connected ? "connected" : ""}`}
            aria-hidden="true"
          />
          <span>
            {login
              ? "Waiting for sign-in…"
              : connection?.connected
                ? "Connected to ChatGPT"
                : "Not connected"}
          </span>
          {connection?.connected && !login && (
            <button
              type="button"
              className="xp-button"
              disabled={busy}
              onClick={() => void action(() => window.computerCat.codexDisconnect())}
            >
              Disconnect
            </button>
          )}
        </div>
        {login ? (
          <>
            {login.userCode ? (
              <label className="device-code">
                Enter this code in your browser
                <input
                  aria-label="Sign-in code"
                  readOnly
                  value={login.userCode}
                  onFocus={(event) => event.target.select()}
                />
              </label>
            ) : (
              <p className="option-note">Finish signing in on the OpenAI page in your browser.</p>
            )}
            <div className="connection-actions">
              <button
                type="button"
                className="xp-button"
                disabled={!login.canOpenBrowser}
                onClick={() =>
                  void action(() => window.computerCat.codexOpen({ attemptId: login.attemptId }))
                }
              >
                Open sign-in page
              </button>
              <button
                type="button"
                className="xp-button"
                onClick={() =>
                  void action(() => window.computerCat.codexCancel({ attemptId: login.attemptId }))
                }
              >
                Cancel sign-in
              </button>
            </div>
            {login.acceptsCode && (
              <details className="callback-fallback">
                <summary>Browser didn't return to Computer Cat?</summary>
                <label htmlFor="codex-callback">
                  Paste the full localhost URL from the browser address bar.
                </label>
                <div className="callback-row">
                  <input
                    id="codex-callback"
                    aria-label="Callback URL"
                    autoComplete="off"
                    spellCheck={false}
                    value={callback}
                    maxLength={4096}
                    onChange={(event) => setCallback(event.target.value)}
                  />
                  <button
                    type="button"
                    className="xp-button"
                    disabled={!callback.trim()}
                    onClick={() =>
                      void action(() =>
                        window.computerCat.codexCode({
                          attemptId: login.attemptId,
                          code: callback,
                        }),
                      )
                    }
                  >
                    Finish
                  </button>
                </div>
              </details>
            )}
          </>
        ) : connection?.connected ? null : (
          <div className="connection-actions">
            <button
              type="button"
              className="xp-button"
              disabled={!connection?.storageAvailable}
              onClick={() =>
                void action(() => window.computerCat.codexLogin({ method: "browser" }))
              }
            >
              Sign in with ChatGPT
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!connection?.storageAvailable}
              onClick={() =>
                void action(() => window.computerCat.codexLogin({ method: "device_code" }))
              }
            >
              Use a device code
            </button>
          </div>
        )}
        {connection && !connection.storageAvailable && (
          <p className="option-note">
            Secure storage is unavailable. Sign-in needs your operating system's credential
            protection.
          </p>
        )}
      </fieldset>
      {!login && (
        <fieldset disabled={disabled || acting}>
          <legend>Default for new conversations</legend>
          <div className="model-row">
            <label htmlFor="model-connection">Connection:</label>
            <select
              id="model-connection"
              value={draft.source}
              onChange={(event) =>
                onChange({ ...draft, source: event.target.value as ModelSettings["source"] })
              }
            >
              <option value="demo">Local demo</option>
              <option value="codex" disabled={!connection?.connected}>
                Codex subscription
              </option>
              {(state?.environment.configured || draft.source === "environment") && (
                <option value="environment">Environment API key</option>
              )}
            </select>
          </div>
          {draft.source === "codex" && (
            <>
              <div className="model-row">
                <label htmlFor="default-model">Model:</label>
                <select
                  id="default-model"
                  value={draft.codexModel}
                  onChange={(event) => {
                    const model = state?.models.find((item) => item.id === event.target.value);
                    if (model)
                      onChange({
                        ...draft,
                        codexModel: model.id,
                        reasoning: model.reasoning.includes(draft.reasoning)
                          ? draft.reasoning
                          : model.reasoning.includes("medium")
                            ? "medium"
                            : (model.reasoning[0] ?? "medium"),
                      });
                  }}
                >
                  {!selectedModel && (
                    <option value={draft.codexModel}>Unavailable: {draft.codexModel}</option>
                  )}
                  {state?.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="model-row">
                <label htmlFor="model-reasoning">Reasoning:</label>
                <select
                  id="model-reasoning"
                  value={draft.reasoning}
                  onChange={(event) =>
                    onChange({ ...draft, reasoning: event.target.value as ReasoningLevel })
                  }
                >
                  {!selectedModel?.reasoning.includes(draft.reasoning) && (
                    <option value={draft.reasoning}>Unavailable: {draft.reasoning}</option>
                  )}
                  {selectedModel?.reasoning.map((level) => (
                    <option key={level} value={level}>
                      {level === "xhigh" ? "Extra high" : level[0]?.toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <p className="option-note">
            {draft.source === "demo"
              ? "Sample replies, with no model requests."
              : draft.source === "environment"
                ? `${state?.environment.provider ?? "Unconfigured"} / ${state?.environment.model ?? "No model"}. Uses API billing.`
                : "Model access and usage limits depend on your plan."}
          </p>
        </fieldset>
      )}
      <p className="option-note">
        {login
          ? "Closing Options cancels this sign-in."
          : "Apply saves defaults for new conversations. Use the selector above chat to change this conversation."}
      </p>
      {connection?.message && (
        <p className="connection-error" role="alert">
          {connection.message}
        </p>
      )}
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
