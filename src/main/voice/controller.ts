import { randomUUID } from "node:crypto";
import {
  appendSchema,
  type CaptureRequest,
  type CaptureStop,
  captureFailureSchema,
  downloadIdSchema,
  finishSchema,
  modelIdSchema,
  sessionSchema,
  VOICE,
  VoiceError,
  type VoiceErrorCode,
  type VoiceResult,
  type VoiceSnapshot,
  voiceSettingsSchema,
} from "../../shared/voice";
import type { VoiceModelStore } from "./model-store";
import type { VoiceSettingsStore } from "./settings";
import type { SpeechRecognizer } from "./whisper-runtime";

interface Hooks {
  conversation(): string;
  agentBusy(): boolean;
  visible(): boolean;
  changed(): void;
  capture(request: CaptureRequest): void;
  stop(request: CaptureStop): void;
  terminateCapture(): void;
}
interface Session {
  id: string;
  conversationId: string;
  abort: AbortController;
  chunks: Uint8Array[];
  bytes: number;
  sequence: number;
  grant: boolean;
  released: boolean;
  started: number;
  timer?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setTimeout>;
  cleanup?: () => void;
  preview?: Promise<void>;
  previewBytes: number;
}
export class VoiceController {
  private state: VoiceSnapshot = {
    revision: 0,
    availability: "disabled",
    phase: "idle",
    elapsedMs: 0,
  };
  private session: Session | undefined;
  private transitions = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private download: { id: string; abort: AbortController; task: Promise<void> } | undefined;
  private warming: { abort: AbortController; task: Promise<void> } | undefined;
  private blocked = new Set<"suspended" | "locked">();
  private disposed = false;
  constructor(
    readonly settings: VoiceSettingsStore,
    private readonly store: Pick<VoiceModelStore, "installed" | "prepare" | "install" | "remove">,
    private readonly runtime: SpeechRecognizer,
    private readonly hooks: Hooks,
    private readonly now = Date.now,
  ) {}
  async refresh(): Promise<void> {
    this.state.installed = await this.store.installed();
    this.state.availability = !this.settings.snapshot().enabled
      ? "disabled"
      : this.state.installed.includes(this.settings.snapshot().modelId)
        ? "ready"
        : "model-missing";
    this.publish();
  }
  private publish(): void {
    this.state.revision++;
    this.hooks.changed();
  }
  snapshot(chat = true): VoiceSnapshot {
    const {
      settings: _settings,
      transcript: _transcript,
      partial: _partial,
      installed: _installed,
      download: _download,
      ...status
    } = this.state;
    return chat
      ? structuredClone({ ...this.state, settings: this.settings.snapshot() })
      : {
          ...status,
          ...(this.state.owner === "pet" ? { transcript: _transcript, partial: _partial } : {}),
        };
  }
  /** Prepare installed weights without granting access to the microphone. */
  async warm(): Promise<void> {
    if (this.warming) return this.warming.task;
    const settings = this.settings.snapshot();
    if (
      !settings.enabled ||
      this.disposed ||
      this.blocked.size ||
      this.busy ||
      this.transitions ||
      this.download ||
      !this.state.installed?.includes(settings.modelId)
    )
      return;
    const abort = new AbortController();
    this.state.availability = "preparing";
    const task = (async () => {
      try {
        const model = await this.store.prepare(settings.modelId, abort.signal);
        await this.runtime.prepare(model, settings, abort.signal);
        if (!abort.signal.aborted) this.state.availability = "ready";
      } catch {
        if (!abort.signal.aborted) this.state.availability = "unavailable";
      } finally {
        this.warming = undefined;
        this.publish();
      }
    })();
    this.warming = { abort, task };
    this.publish();
    await task;
  }
  private async stopWarm(): Promise<void> {
    const warming = this.warming;
    warming?.abort.abort();
    await warming?.task;
  }
  get busy(): boolean {
    return !!this.session && this.state.phase !== "review";
  }
  get permissionGranted(): boolean {
    return (
      !!this.session?.grant &&
      ["starting", "recording"].includes(this.state.phase) &&
      this.hooks.visible()
    );
  }
  // Reserve synchronously before any await; starts cannot cross an in-flight chat transition.
  transition<T>(run: () => Promise<T> | T): Promise<T> {
    this.transitions++;
    const task = this.queue.then(async () => {
      await this.cancel();
      return run();
    });
    this.queue = task.catch(() => {});
    return task.finally(() => {
      this.transitions--;
    });
  }
  private current(id: string): Session {
    if (!this.session || this.session.id !== id) throw new VoiceError("cancelled");
    return this.session;
  }
  async action(run: () => Promise<void> | void): Promise<VoiceResult> {
    try {
      await run();
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e instanceof VoiceError ? e.code : "protocol-error" };
    }
  }
  async start(owner: "chat" | "pet" = "chat"): Promise<void> {
    if (
      this.disposed ||
      this.blocked.size ||
      this.busy ||
      this.transitions ||
      this.download ||
      this.hooks.agentBusy()
    )
      throw new VoiceError("busy");
    const settings = this.settings.snapshot();
    if (!settings.enabled) throw new VoiceError("disabled");
    // An unconsumed result must be transferred/discarded before another recording.
    if (this.state.transcript) throw new VoiceError("busy");
    const s: Session = {
      id: randomUUID(),
      conversationId: this.hooks.conversation(),
      abort: new AbortController(),
      chunks: [],
      bytes: 0,
      sequence: 0,
      grant: false,
      released: true,
      started: 0,
      previewBytes: 0,
    };
    this.session = s;
    this.state = {
      ...this.state,
      phase: "starting",
      availability: "preparing",
      sessionId: s.id,
      conversationId: s.conversationId,
      elapsedMs: 0,
      owner,
    };
    delete this.state.error;
    delete this.state.partial;
    this.publish();
    try {
      await this.warming?.task;
      if (s.abort.signal.aborted) return;
      const model = await this.store.prepare(settings.modelId, s.abort.signal);
      await this.runtime.prepare(model, settings, s.abort.signal);
      if (this.session !== s || s.abort.signal.aborted) return;
      if (!this.hooks.visible()) throw new VoiceError("capture-failed");
      s.grant = true;
      s.released = false;
      this.state.backend = "cpu";
      this.state.availability = "ready";
      s.timer = setTimeout(() => void this.fail(s, "capture-failed"), VOICE.startupMs);
      this.hooks.capture({
        sessionId: s.id,
        conversationId: s.conversationId,
        ...(settings.inputDeviceId ? { inputDeviceId: settings.inputDeviceId } : {}),
      });
      this.publish();
    } catch (e) {
      if (this.session === s && !s.abort.signal.aborted)
        await this.fail(s, e instanceof VoiceError ? e.code : "model-load-failed");
    }
  }
  captureStarted(input: unknown): void {
    const s = this.current(sessionSchema.parse(input).sessionId);
    if (this.state.phase !== "starting" || !s.grant) throw new VoiceError("protocol-error");
    clearTimeout(s.timer);
    s.started = this.now();
    this.state.phase = "recording";
    s.timer = setTimeout(() => this.requestFinish({ sessionId: s.id }), VOICE.captureMs);
    this.heartbeat(s);
    this.publish();
  }
  private preview(s: Session): void {
    // One best-effort pass at a time, at least four seconds of new audio per pass.
    if (s.preview || s.bytes - s.previewBytes < 128000 || this.state.phase !== "recording") return;
    s.previewBytes = s.bytes;
    const pcm = new Uint8Array(s.bytes);
    let offset = 0;
    for (const chunk of s.chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    s.preview = (async () => {
      try {
        const text = await this.runtime.transcribe(
          pcm,
          this.settings.snapshot().language,
          s.abort.signal,
        );
        if (this.session === s && !s.abort.signal.aborted && this.state.phase === "recording") {
          this.state.partial = text.slice(0, VOICE.maxText);
          this.publish();
        }
      } catch (error) {
        // Silence is expected in previews. Other failures need a fresh helper for final inference.
        if (
          this.session === s &&
          !s.abort.signal.aborted &&
          !(error instanceof VoiceError && error.code === "no-speech")
        ) {
          await this.fail(s, error instanceof VoiceError ? error.code : "helper-crashed");
        }
      } finally {
        pcm.fill(0);
        delete s.preview;
      }
    })();
  }
  private heartbeat(s: Session): void {
    clearTimeout(s.heartbeat);
    s.heartbeat = setTimeout(() => void this.fail(s, "capture-failed"), VOICE.heartbeatMs);
  }
  append(input: unknown): void {
    const p = appendSchema.safeParse(input);
    if (!p.success) {
      if (
        this.session &&
        typeof input === "object" &&
        input !== null &&
        "sessionId" in input &&
        input.sessionId === this.session.id
      )
        void this.fail(this.session, "capture-overrun");
      throw new VoiceError("protocol-error");
    }
    const s = this.current(p.data.sessionId);
    if (
      !["recording", "finalizing"].includes(this.state.phase) ||
      p.data.sequence !== s.sequence ||
      s.bytes + p.data.pcm.byteLength > VOICE.totalBytes ||
      s.bytes + p.data.pcm.byteLength > (this.now() - s.started + 1000) * 32
    ) {
      void this.fail(s, "capture-overrun");
      throw new VoiceError("capture-overrun");
    }
    s.chunks.push(p.data.pcm.slice());
    s.sequence++;
    s.bytes += p.data.pcm.byteLength;
    this.state.elapsedMs = Math.min(VOICE.captureMs, Math.max(0, this.now() - s.started));
    if (this.state.phase === "recording") this.heartbeat(s);
    this.publish();
    this.preview(s);
  }
  requestFinish(input: unknown): void {
    const s = this.current(sessionSchema.parse(input).sessionId);
    if (this.state.phase === "finalizing") return;
    if (this.state.phase !== "recording") throw new VoiceError("busy");
    s.grant = false;
    clearTimeout(s.timer);
    clearTimeout(s.heartbeat);
    this.state.phase = "finalizing";
    s.timer = setTimeout(() => void this.fail(s, "capture-failed"), VOICE.stopMs);
    this.hooks.stop({ sessionId: s.id, reason: "finish" });
    this.publish();
  }
  released(input: unknown): void {
    const id = sessionSchema.parse(input).sessionId;
    if (this.session?.id === id) {
      this.session.released = true;
      this.session.cleanup?.();
    }
  }
  async finish(input: unknown): Promise<void> {
    const p = finishSchema.parse(input);
    const s = this.current(p.sessionId);
    if (this.state.phase !== "finalizing" || !s.released || s.sequence !== p.nextSequence) {
      await this.fail(s, "protocol-error");
      return;
    }
    clearTimeout(s.timer);
    if (s.bytes < VOICE.minBytes) {
      await this.fail(s, "too-short");
      return;
    }
    const pcm = new Uint8Array(s.bytes);
    let offset = 0;
    for (const c of s.chunks) {
      pcm.set(c, offset);
      offset += c.length;
    }
    s.chunks = [];
    this.state.phase = "transcribing";
    this.publish();
    try {
      if (s.preview) await s.preview;
      if (this.session !== s || s.abort.signal.aborted) return;
      const text = await this.runtime.transcribe(
        pcm,
        this.settings.snapshot().language,
        s.abort.signal,
      );
      if (
        this.session !== s ||
        s.abort.signal.aborted ||
        this.hooks.conversation() !== s.conversationId
      )
        return;
      if (text.length > VOICE.maxText) throw new VoiceError("text-too-long");
      this.state.phase = "review";
      delete this.state.partial;
      this.state.transcript = text;
      this.publish();
    } catch (e) {
      if (this.session === s && !s.abort.signal.aborted)
        await this.fail(s, e instanceof VoiceError ? e.code : "helper-crashed");
    } finally {
      pcm.fill(0);
    }
  }
  consumed(input: unknown): void {
    const id = sessionSchema.parse(input).sessionId;
    if (this.session?.id !== id || this.state.phase !== "review") return;
    delete this.state.transcript;
    delete this.state.partial;
    this.session = undefined;
    this.state.phase = "idle";
    delete this.state.sessionId;
    delete this.state.conversationId;
    this.publish();
  }
  async captureFailed(input: unknown): Promise<void> {
    const p = captureFailureSchema.parse(input);
    await this.fail(this.current(p.sessionId), p.code);
  }
  private async fail(s: Session, code: VoiceErrorCode): Promise<void> {
    if (this.session !== s) return;
    await this.cancel(s.id);
    this.state.error = code;
    this.publish();
  }
  async cancel(id?: string): Promise<void> {
    const s = this.session;
    if (!s || (id && s.id !== id) || this.state.phase === "review") return;
    if (this.state.phase === "cancelling") {
      await this.queueCleanup;
      return;
    }
    // A cancelled recording with no inference can reuse the already loaded model.
    const releaseModel =
      this.state.phase === "starting" || this.state.phase === "transcribing" || !!s.preview;
    s.grant = false;
    s.abort.abort();
    s.chunks = [];
    clearTimeout(s.timer);
    clearTimeout(s.heartbeat);
    this.state.phase = "cancelling";
    this.publish();
    this.queueCleanup = (async () => {
      await this.stopWarm();
      const cleanup = s.released
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              this.hooks.terminateCapture();
              s.released = true;
              resolve();
            }, VOICE.stopMs);
            s.cleanup = () => {
              clearTimeout(timer);
              resolve();
            };
            this.hooks.stop({ sessionId: s.id, reason: "cancel" });
          });
      await Promise.all([cleanup, releaseModel ? this.runtime.dispose() : Promise.resolve()]);
      if (this.session === s) {
        this.session = undefined;
        this.state.phase = "idle";
        delete this.state.partial;
        delete this.state.sessionId;
        delete this.state.conversationId;
        this.publish();
      }
    })();
    await this.queueCleanup;
  }
  private queueCleanup: Promise<void> = Promise.resolve();
  async updateSettings(input: unknown): Promise<void> {
    const value = voiceSettingsSchema.parse(input);
    if (this.busy && value.enabled) throw new VoiceError("busy");
    await this.transition(async () => {
      await this.stopWarm();
      await this.settings.update(value);
      await this.runtime.dispose();
      await this.refresh();
    });
    void this.warm();
  }
  async downloadModel(input: unknown): Promise<void> {
    const { modelId } = modelIdSchema.parse(input);
    if (this.busy || this.transitions || this.download) throw new VoiceError("busy");
    const abort = new AbortController();
    const id = randomUUID();
    this.state.download = { id, modelId, received: 0, total: 0 };
    this.publish();
    let lastProgress = 0;
    const task = this.store
      .install(modelId, abort.signal, (received, total) => {
        this.state.download = { id, modelId, received, total };
        if (received === total || this.now() - lastProgress >= 100) {
          lastProgress = this.now();
          this.publish();
        }
      })
      .catch((e) => {
        if (abort.signal.aborted) delete this.state.error;
        else this.state.error = e instanceof VoiceError ? e.code : "download-failed";
      })
      .finally(async () => {
        this.download = undefined;
        delete this.state.download;
        await this.refresh();
        void this.warm();
      });
    this.download = { id, abort, task };
  }
  cancelDownload(input: unknown): void {
    const { downloadId } = downloadIdSchema.parse(input);
    if (this.download?.id === downloadId) this.download.abort.abort();
  }
  async removeModel(input: unknown): Promise<void> {
    const { modelId } = modelIdSchema.parse(input);
    if (this.busy || this.download || this.transitions) throw new VoiceError("busy");
    await this.transition(async () => {
      await this.stopWarm();
      await this.runtime.dispose();
      await this.store.remove(modelId);
      await this.refresh();
    });
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.stopWarm();
    this.download?.abort.abort();
    await this.cancel();
    await this.download?.task;
    await this.runtime.dispose();
  }
  async setBlocked(reason: "suspended" | "locked", blocked: boolean): Promise<void> {
    if (blocked) this.blocked.add(reason);
    else this.blocked.delete(reason);
    await this.transition(async () => {
      if (this.blocked.size) {
        await this.stopWarm();
        await this.runtime.dispose();
      }
    });
    if (!this.blocked.size) void this.warm();
  }
}
