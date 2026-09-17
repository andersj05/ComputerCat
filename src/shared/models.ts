import { z } from "zod";

export const reasoningSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
export type ReasoningLevel = z.infer<typeof reasoningSchema>;

export const modelSettingsSchema = z.strictObject({
  source: z.enum(["demo", "codex", "environment"]),
  codexModel: z.string().min(1).max(120),
  reasoning: reasoningSchema,
});
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

export const loginRequestSchema = z.strictObject({ method: z.enum(["browser", "device_code"]) });
export const loginAttemptSchema = z.strictObject({ attemptId: z.uuid() });
export const loginCodeSchema = loginAttemptSchema.extend({
  code: z.string().trim().min(1).max(4096),
});
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
