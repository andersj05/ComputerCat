import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { VOICE, VoiceError, type VoiceSettings } from "../../shared/voice";
import { FrameParser, frame, type HelperMessage } from "./helper-protocol";

export interface PreparedModel {
  modelPath: string;
  vadPath: string;
  modelId: VoiceSettings["modelId"];
}
export interface SpeechRecognizer {
  prepare(model: PreparedModel, settings: VoiceSettings, signal: AbortSignal): Promise<void>;
  transcribe(
    pcm: Uint8Array,
    language: VoiceSettings["language"],
    signal: AbortSignal,
  ): Promise<string>;
  dispose(): Promise<void>;
}
export function helperEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap((key) =>
      source[key] ? [[key, source[key]]] : [],
    ),
  );
}
export class WhisperRuntime implements SpeechRecognizer {
  private child: ChildProcessWithoutNullStreams | undefined;
  private exited: Promise<void> = Promise.resolve();
  private pending:
    | { id: string | null; resolve: (v: HelperMessage) => void; reject: (e: Error) => void }
    | undefined;
  private readyModel: string | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private disposing: Promise<void> | undefined;
  constructor(
    executable: string,
    private readonly launch = () =>
      spawn(executable, [], {
        cwd: dirname(executable),
        shell: false,
        windowsHide: true,
        env: helperEnvironment(process.env),
        stdio: "pipe",
      }),
  ) {}

  private fail(error: Error): void {
    this.pending?.reject(error);
    this.pending = undefined;
    this.readyModel = undefined;
    if (this.child) this.child.kill();
  }
  private async start(signal: AbortSignal): Promise<void> {
    await this.disposing;
    if (this.child) return;
    signal.throwIfAborted();
    const child = this.launch();
    this.child = child;
    this.exited = new Promise((resolve) => {
      child.once("close", () => {
        if (this.child === child) {
          this.fail(new VoiceError("helper-crashed"));
          this.child = undefined;
        }
        resolve();
      });
    });
    const parser = new FrameParser();
    child.on("error", () => this.fail(new VoiceError("helper-crashed")));
    child.stdin.on("error", () => this.fail(new VoiceError("helper-crashed")));
    child.stderr.resume(); // Do not retain native paths, audio or text in diagnostics.
    child.stdout.on("data", (data: Buffer) => {
      try {
        for (const message of parser.push(data)) {
          const expected = this.pending;
          if (
            !expected ||
            (expected.id === null
              ? message.kind !== "hello"
              : !("requestId" in message) || message.requestId !== expected.id)
          )
            throw new VoiceError("protocol-error");
          this.pending = undefined;
          expected.resolve(message);
        }
      } catch {
        this.fail(new VoiceError("protocol-error"));
      }
    });
    await this.wait(null, undefined, undefined, signal, VOICE.loadMs);
  }
  private wait(
    id: string | null,
    control: object | undefined,
    pcm: Uint8Array | undefined,
    signal: AbortSignal,
    deadline: number,
  ): Promise<HelperMessage> {
    if (this.pending || signal.aborted)
      return Promise.reject(new VoiceError(signal.aborted ? "cancelled" : "busy"));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        this.pending = undefined;
        if (id) this.child?.stdin.write(frame({ kind: "cancel", requestId: id }));
        reject(new VoiceError("cancelled"));
        void this.dispose();
      };
      const timer = setTimeout(() => {
        cleanup();
        this.pending = undefined;
        reject(new VoiceError(id ? "transcription-timeout" : "helper-crashed"));
        void this.dispose();
      }, deadline);
      this.pending = {
        id,
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };
      signal.addEventListener("abort", abort, { once: true });
      if (control) this.child?.stdin.write(frame(control, pcm));
    });
  }
  async prepare(model: PreparedModel, settings: VoiceSettings, signal: AbortSignal): Promise<void> {
    clearTimeout(this.idle);
    if (settings.backend === "cuda") throw new VoiceError("backend-unavailable");
    try {
      await this.start(signal);
      if (this.readyModel === model.modelPath) return;
      const requestId = randomUUID();
      const reply = await this.wait(
        requestId,
        { kind: "load", requestId, ...model, backend: "cpu", threads: 6 },
        undefined,
        signal,
        VOICE.loadMs,
      );
      if (reply.kind === "error") throw new VoiceError(reply.code);
      if (reply.kind !== "ready" || reply.modelId !== model.modelId)
        throw new VoiceError("protocol-error");
      this.readyModel = model.modelPath;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }
  async transcribe(
    pcm: Uint8Array,
    language: VoiceSettings["language"],
    signal: AbortSignal,
  ): Promise<string> {
    clearTimeout(this.idle);
    if (!this.readyModel) throw new VoiceError("model-load-failed");
    if (pcm.length < VOICE.minBytes || pcm.length > VOICE.totalBytes || pcm.length % 2)
      throw new VoiceError("protocol-error");
    try {
      const requestId = randomUUID();
      const result = await this.wait(
        requestId,
        {
          kind: "transcribe",
          requestId,
          language,
          sampleRate: VOICE.sampleRate,
          sampleCount: pcm.length / 2,
        },
        pcm,
        signal,
        VOICE.inferenceMs,
      );
      if (result.kind === "no-speech") throw new VoiceError("no-speech");
      if (result.kind === "error") throw new VoiceError(result.code);
      if (result.kind !== "result") throw new VoiceError("protocol-error");
      const text = result.text.trim();
      if (!text) throw new VoiceError("no-speech");
      return text;
    } catch (error) {
      await this.dispose();
      throw error;
    } finally {
      this.idle = setTimeout(() => void this.dispose(), VOICE.idleMs);
      this.idle.unref();
    }
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    clearTimeout(this.idle);
    this.readyModel = undefined;
    const child = this.child;
    if (!child) return Promise.resolve();
    this.pending?.reject(new VoiceError("cancelled"));
    this.pending = undefined;
    this.disposing = (async () => {
      const kill = setTimeout(() => child.kill(), VOICE.stopMs);
      child.stdin.end(frame({ kind: "shutdown" }));
      await this.exited;
      clearTimeout(kill);
      if (this.child === child) this.child = undefined;
    })().finally(() => {
      this.disposing = undefined;
    });
    return this.disposing;
  }
}
