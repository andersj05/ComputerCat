import type { VoiceAPI as importVoiceAPI } from "./voice";
export const IPC = {
  voiceSnapshot: "cat:voiceSnapshot",
  voiceStart: "cat:voiceStart",
  voiceCaptureStarted: "cat:voiceCaptureStarted",
  voiceAppend: "cat:voiceAppend",
  voiceRequestFinish: "cat:voiceRequestFinish",
  voiceFinish: "cat:voiceFinish",
  voiceCancel: "cat:voiceCancel",
  voiceCaptureFailed: "cat:voiceCaptureFailed",
  voiceCaptureReleased: "cat:voiceCaptureReleased",
  voiceResultConsumed: "cat:voiceResultConsumed",
  voiceUpdateSettings: "cat:voiceUpdateSettings",
  voiceDownloadModel: "cat:voiceDownloadModel",
  voiceCancelDownload: "cat:voiceCancelDownload",
  voiceRemoveModel: "cat:voiceRemoveModel",
  voiceChanged: "cat:voiceChanged",
  voiceCaptureRequested: "cat:voiceCaptureRequested",
  voiceCaptureStopped: "cat:voiceCaptureStopped",
  info: "cat:info",
  snapshot: "cat:snapshot",
  send: "cat:send",
  copyReply: "cat:copy-reply",
  stop: "cat:stop",
  clear: "cat:clear",
  conversations: "cat:conversations",
  openConversation: "cat:open-conversation",
  deleteConversation: "cat:delete-conversation",
  selectModel: "cat:select-model",
  openModels: "cat:open-models",
  modelsRequested: "cat:models-requested",
  openChat: "cat:open-chat",
  openHistory: "cat:open-history",
  historyRequested: "cat:history-requested",
  petExpanded: "cat:pet-expanded",
  resizePetPanel: "cat:resize-pet-panel",
  petTalkRequested: "cat:pet-talk-requested",
  openOptions: "cat:open-options",
  openHarnessGuide: "cat:open-harness-guide",
  optionsRequested: "cat:options-requested",
  dragPet: "cat:drag-pet",
  petVoiceOpen: "cat:pet-voice-open",
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

export type PetResizeEdge = "top" | "left" | "top-left";
export type PetResizeRequest =
  | { phase: "start"; edge: PetResizeEdge }
  | { phase: "move" | "end" | "cancel" }
  | { phase: "step"; axis: "width" | "height"; delta: -40 | -10 | 10 | 40 };

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

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: ModelSettings;
  messageCount: number;
}

export interface ChatSnapshot {
  conversationId?: string;
  title?: string;
  persistenceError?: string;
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
  talkShortcut?: string;
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

export interface ComputerCatAPI extends importVoiceAPI {
  info(): Promise<AppInfo>;
  snapshot(): Promise<ChatSnapshot>;
  send(request: SendRequest): Promise<ActionResult>;
  copyReply(messageId: string): Promise<ActionResult>;
  stop(): Promise<void>;
  clear(): Promise<ActionResult>;
  conversations(): Promise<ConversationSummary[]>;
  openConversation(id: string): Promise<ActionResult>;
  deleteConversation(id: string): Promise<ActionResult>;
  selectModel(settings: ModelSettings): Promise<ActionResult>;
  openModels(): Promise<void>;
  onModelsRequested(listener: () => void): () => void;
  openChat(): Promise<void>;
  openHistory(): Promise<void>;
  onHistoryRequested(listener: () => void): () => void;
  onPetTalkRequested(listener: () => void): () => void;
  setPetExpanded(expanded: boolean): Promise<void>;
  resizePetPanel(request: PetResizeRequest): Promise<void>;
  openOptions(tab?: "voice"): Promise<void>;
  openHarnessGuide(): Promise<ActionResult>;
  onOptionsRequested(listener: (tab?: "voice") => void): () => void;
  dragPet(phase: "start" | "move" | "end" | "cancel"): Promise<{ moved: boolean }>;
  setPetVoiceOpen(open: boolean): Promise<void>;
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
