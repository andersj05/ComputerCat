export const IPC = {
  info: "cat:info",
  snapshot: "cat:snapshot",
  send: "cat:send",
  stop: "cat:stop",
  clear: "cat:clear",
  openChat: "cat:open-chat",
  hideChat: "cat:hide-chat",
  quit: "cat:quit",
  changed: "cat:changed",
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
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export interface ComputerCatAPI {
  info(): Promise<AppInfo>;
  snapshot(): Promise<ChatSnapshot>;
  send(request: SendRequest): Promise<ActionResult>;
  stop(): Promise<void>;
  clear(): Promise<ActionResult>;
  openChat(): Promise<void>;
  hideChat(): Promise<void>;
  quit(): Promise<void>;
  onChanged(listener: (snapshot: ChatSnapshot) => void): () => void;
}
