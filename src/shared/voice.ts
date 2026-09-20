import { z } from "zod";

export const VOICE = {
  sampleRate: 16000,
  chunkBytes: 16000,
  totalBytes: 3840000,
  minBytes: 9600,
  maxText: 6000,
  captureMs: 120000,
  startupMs: 15000,
  heartbeatMs: 2000,
  stopMs: 2000,
  loadMs: 60000,
  inferenceMs: 120000,
  idleMs: 300000,
} as const;
export const voiceSettingsSchema = z
  .strictObject({
    version: z.literal(1),
    enabled: z.boolean(),
    keepReady: z.boolean().default(true),
    modelId: z.enum(["large-v3-turbo", "base.en"]),
    language: z.enum(["en", "auto"]),
    backend: z.enum(["auto", "cpu", "cuda"]),
    inputDeviceId: z.string().max(512).optional(),
  })
  .refine((v) => v.modelId !== "base.en" || v.language === "en");
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;
export const DEFAULT_VOICE: VoiceSettings = {
  version: 1,
  enabled: false,
  keepReady: true,
  modelId: "large-v3-turbo",
  language: "en",
  backend: "auto",
};
export const voiceErrorSchema = z.enum([
  "disabled",
  "busy",
  "model-missing",
  "download-failed",
  "integrity-failed",
  "disk-full",
  "permission-denied",
  "device-missing",
  "device-busy",
  "capture-failed",
  "capture-overrun",
  "too-short",
  "no-speech",
  "backend-unavailable",
  "model-load-failed",
  "helper-crashed",
  "protocol-error",
  "transcription-timeout",
  "text-too-long",
  "cancelled",
]);
export type VoiceErrorCode = z.infer<typeof voiceErrorSchema>;
export class VoiceError extends Error {
  constructor(public readonly code: VoiceErrorCode) {
    super(code);
  }
}
export const voiceMessages: Record<VoiceErrorCode, string> = {
  disabled: "Enable voice in Options first.",
  busy: "Finish or stop the current activity first.",
  "model-missing": "Download the selected speech model in Options.",
  "download-failed": "The download failed. Check your connection and try again.",
  "integrity-failed": "The model could not be verified. Download it again.",
  "disk-full": "There isn't enough disk space for this model.",
  "permission-denied": "Microphone access was denied. Check Windows microphone settings.",
  "device-missing": "No microphone was found. Connect one and try again.",
  "device-busy": "The microphone is busy. Close other recording apps and try again.",
  "capture-failed": "The microphone stopped working. Try recording again.",
  "capture-overrun": "Recording could not keep up. Try again.",
  "too-short": "The recording was too short. Try again.",
  "no-speech": "No speech detected. Try again.",
  "backend-unavailable": "This build supports CPU recognition. Select Auto or CPU.",
  "model-load-failed":
    "The speech model could not load or transcribe. Try the smaller English model.",
  "helper-crashed": "The speech engine stopped. Try again.",
  "protocol-error": "The speech engine returned an invalid response. Try again.",
  "transcription-timeout":
    "Transcription took too long. Try a shorter recording or the smaller model.",
  "text-too-long": "The transcript is too long for one message.",
  cancelled: "Recording cancelled.",
};
export const sessionSchema = z.strictObject({ sessionId: z.uuid() });
export const appendSchema = sessionSchema.extend({
  sequence: z.number().int().min(0).max(480000),
  pcm: z
    .instanceof(Uint8Array)
    .refine((v) => v.byteLength > 0 && v.byteLength <= VOICE.chunkBytes && v.byteLength % 2 === 0),
});
export const finishSchema = sessionSchema.extend({
  nextSequence: z.number().int().min(0).max(480000),
});
export const captureFailureSchema = sessionSchema.extend({
  code: z.enum([
    "permission-denied",
    "device-missing",
    "device-busy",
    "capture-failed",
    "capture-overrun",
  ]),
});
export const modelIdSchema = z.strictObject({ modelId: z.enum(["large-v3-turbo", "base.en"]) });
export const downloadIdSchema = z.strictObject({ downloadId: z.uuid() });
export type VoicePhase =
  | "idle"
  | "starting"
  | "recording"
  | "finalizing"
  | "transcribing"
  | "review"
  | "cancelling";
export interface VoiceSnapshot {
  revision: number;
  availability: "disabled" | "model-missing" | "preparing" | "ready" | "unavailable";
  phase: VoicePhase;
  elapsedMs: number;
  backend?: "cpu";
  sessionId?: string;
  conversationId?: string;
  error?: VoiceErrorCode;
  settings?: VoiceSettings;
  transcript?: string;
  partial?: string;
  owner?: "chat" | "pet";
  installed?: string[];
  download?: { id: string; modelId: string; received: number; total: number };
}
export interface CaptureRequest {
  sessionId: string;
  conversationId: string;
  inputDeviceId?: string;
}
export interface CaptureStop {
  sessionId: string;
  reason: "finish" | "cancel";
}
export type VoiceResult = { ok: true } | { ok: false; code: VoiceErrorCode };
export interface VoiceAPI {
  voiceSnapshot(): Promise<VoiceSnapshot>;
  voiceStart(): Promise<VoiceResult>;
  voiceCaptureStarted(request: { sessionId: string }): Promise<VoiceResult>;
  voiceAppend(request: {
    sessionId: string;
    sequence: number;
    pcm: Uint8Array;
  }): Promise<VoiceResult>;
  voiceRequestFinish(request: { sessionId: string }): Promise<VoiceResult>;
  voiceFinish(request: { sessionId: string; nextSequence: number }): Promise<VoiceResult>;
  voiceCancel(request: { sessionId: string }): Promise<VoiceResult>;
  voiceCaptureFailed(request: { sessionId: string; code: VoiceErrorCode }): Promise<VoiceResult>;
  voiceCaptureReleased(request: { sessionId: string }): Promise<VoiceResult>;
  voiceResultConsumed(request: { sessionId: string }): Promise<VoiceResult>;
  voiceUpdateSettings(settings: VoiceSettings): Promise<VoiceResult>;
  voiceDownloadModel(request: { modelId: string }): Promise<VoiceResult>;
  voiceCancelDownload(request: { downloadId: string }): Promise<VoiceResult>;
  voiceRemoveModel(request: { modelId: string }): Promise<VoiceResult>;
  onVoiceChanged(listener: (snapshot: VoiceSnapshot) => void): () => void;
  onVoiceCaptureRequested(listener: (request: CaptureRequest) => void): () => void;
  onVoiceCaptureStopped(listener: (request: CaptureStop) => void): () => void;
}
