import type { z } from "zod";
import type { loginRequestSchema, modelSettingsSchema, reasoningSchema } from "./validation";
export type ReasoningLevel = z.infer<typeof reasoningSchema>;
export type ModelSettings = z.infer<typeof modelSettingsSchema>;

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  source: "demo",
  codexModel: "gpt-5.6-sol",
  reasoning: "medium",
};

export interface ModelChoice {
  id: string;
  name: string;
  reasoning: ReasoningLevel[];
}

export type LoginMethod = z.infer<typeof loginRequestSchema>["method"];

// Only display data crosses the renderer bridge. Tokens and auth URLs stay in main.
export interface CodexConnection {
  connected: boolean;
  storageAvailable: boolean;
  login: {
    attemptId: string;
    method: LoginMethod;
    canOpenBrowser: boolean;
    acceptsCode: boolean;
    userCode: string | null;
  } | null;
  message: string | null;
}

export interface ModelState {
  defaults: ModelSettings;
  active: ModelSettings;
  models: ModelChoice[];
  codex: CodexConnection;
  environment: { configured: boolean; provider: string | null; model: string | null };
}

export function activeModelInfo(state: ModelState) {
  const source = state.active.source;
  return {
    mode: source === "demo" ? ("demo" as const) : ("pi" as const),
    provider:
      source === "codex"
        ? "openai-codex"
        : source === "environment"
          ? state.environment.provider
          : null,
    model:
      source === "codex"
        ? state.active.codexModel
        : source === "environment"
          ? state.environment.model
          : null,
    configured:
      source === "codex"
        ? state.codex.connected
        : source === "environment"
          ? state.environment.configured
          : false,
  };
}
