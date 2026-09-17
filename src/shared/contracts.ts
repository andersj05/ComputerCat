export const IPC = {
  info: "cat:info",
  snapshot: "cat:snapshot",
  send: "cat:send",
  stop: "cat:stop",
  clear: "cat:clear",
  openChat: "cat:open-chat",
  openOptions: "cat:open-options",
  optionsRequested: "cat:options-requested",
  dragPet: "cat:drag-pet",
  hideChat: "cat:hide-chat",
  minimizeChat: "cat:minimize-chat",
  toggleMaximizeChat: "cat:toggle-maximize-chat",
  windowChanged: "cat:window-changed",
  showPet: "cat:show-pet",
  updatePreferences: "cat:update-preferences",
  preferencesChanged: "cat:preferences-changed",
  quit: "cat:quit",
  changed: "cat:changed",
  updateModels: "cat:update-models",
  modelsChanged: "cat:models-changed",
  codexLogin: "cat:codex-login",
  codexCancel: "cat:codex-cancel",
  codexOpen: "cat:codex-open",
  codexCode: "cat:codex-code",
  codexDisconnect: "cat:codex-disconnect",
} as const;

export interface SendRequest {
  id: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  state: "complete" | "streaming" | "stopped" | "error";
  tools?: import("./tools").ToolActivity[] | undefined;
}

export interface ChatSnapshot {
  messages: ChatMessage[];
  busy: boolean;
}

export interface AppInfo {
  version: string;
  mode: "demo" | "pi";
  provider: string | null;
  model: string | null;
  configured: boolean;
  shortcut: string;
  stopShortcut: string;
  preferences: PetPreferences;
  maximized: boolean;
  models: ModelState;
}

export interface PetPreferences {
  size: "small" | "medium" | "large";
  alwaysOnTop: boolean;
  animation: boolean;
}

export const DEFAULT_PREFERENCES: PetPreferences = {
  size: "medium",
  alwaysOnTop: true,
  animation: true,
};

export type ActionResult = { ok: true } | { ok: false; message: string };

export interface ComputerCatAPI {
  info(): Promise<AppInfo>;
  snapshot(): Promise<ChatSnapshot>;
  send(request: SendRequest): Promise<ActionResult>;
  stop(): Promise<void>;
  clear(): Promise<ActionResult>;
  openChat(): Promise<void>;
  openOptions(): Promise<void>;
  onOptionsRequested(listener: () => void): () => void;
  dragPet(phase: "start" | "move" | "end" | "cancel"): Promise<{ moved: boolean }>;
  hideChat(): Promise<void>;
  minimizeChat(): Promise<void>;
  toggleMaximizeChat(): Promise<void>;
  showPet(): Promise<void>;
  updatePreferences(patch: Partial<PetPreferences>): Promise<ActionResult>;
  onPreferencesChanged(listener: (preferences: PetPreferences) => void): () => void;
  onWindowChanged(listener: (maximized: boolean) => void): () => void;
  updateModels(settings: ModelSettings): Promise<ActionResult>;
  onModelsChanged(listener: (state: ModelState) => void): () => void;
  codexLogin(request: { method: LoginMethod }): Promise<ActionResult>;
  codexCancel(request: { attemptId: string }): Promise<ActionResult>;
  codexOpen(request: { attemptId: string }): Promise<ActionResult>;
  codexCode(request: { attemptId: string; code: string }): Promise<ActionResult>;
  codexDisconnect(): Promise<ActionResult>;
  quit(): Promise<void>;
  onChanged(listener: (snapshot: ChatSnapshot) => void): () => void;
}

import type { LoginMethod, ModelSettings, ModelState } from "./models";
