import type { CaptureRequest, VoiceAPI, VoiceErrorCode } from "../../../shared/voice";
import workletUrl from "./pcm-worklet.ts?worker&url";
export class VoiceCapture {
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private worklet: AudioWorkletNode | undefined;
  private cancelled = false;
  private finishing = false;
  private sequence = 0;
  private queue: Promise<void> = Promise.resolve();
  private flushed: (() => void) | undefined;
  private starting: Promise<void> = Promise.resolve();
  constructor(
    private readonly request: CaptureRequest,
    private readonly api: VoiceAPI,
  ) {}
  start(): void {
    this.starting = this.open();
  }
  private async open(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          ...(this.request.inputDeviceId
            ? { deviceId: { exact: this.request.inputDeviceId } }
            : {}),
        },
        video: false,
      });
      this.stream = stream;
      if (this.cancelled) return;
      for (const track of stream.getTracks())
        track.onended = () => {
          if (!this.cancelled && !this.finishing) void this.fail("device-missing");
        };
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule(workletUrl);
      if (this.cancelled) return;
      const worklet = new AudioWorkletNode(context, "computercat-pcm", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.worklet = worklet;
      worklet.onprocessorerror = () => void this.fail("capture-failed");
      worklet.port.onmessage = (event) => {
        if (this.cancelled) return;
        if (event.data === "overrun") {
          void this.fail("capture-overrun");
          return;
        }
        if (event.data === "flushed") {
          this.flushed?.();
          return;
        }
        if (event.data === "started")
          this.queue = this.queue
            .then(async () => {
              const r = await this.api.voiceCaptureStarted({ sessionId: this.request.sessionId });
              if (!r.ok) throw Error();
            })
            .catch(() => this.fail("capture-failed"));
        if (event.data instanceof Uint8Array) {
          const pcm = event.data;
          const sequence = this.sequence++;
          this.queue = this.queue
            .then(async () => {
              if (this.cancelled) return;
              const r = await this.api.voiceAppend({
                sessionId: this.request.sessionId,
                sequence,
                pcm,
              });
              pcm.fill(0);
              if (!r.ok) throw Error();
              worklet.port.postMessage("ack");
            })
            .catch(() => this.fail("capture-overrun"));
        }
      };
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(worklet);
      worklet.connect(context.destination);
      await context.resume();
    } catch (e) {
      if (!this.cancelled) {
        const name = (e as DOMException).name;
        await this.fail(
          name === "NotAllowedError"
            ? "permission-denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "device-missing"
              : name === "NotReadableError"
                ? "device-busy"
                : "capture-failed",
        );
      }
    } finally {
      if (this.cancelled) await this.cleanup();
    }
  }
  private async fail(code: VoiceErrorCode): Promise<void> {
    this.cancelled = true;
    await this.cleanup();
    await this.api.voiceCaptureFailed({ sessionId: this.request.sessionId, code }).catch(() => {});
  }
  private async cleanup(): Promise<void> {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.source?.disconnect();
    this.worklet?.disconnect();
    this.worklet?.port.close();
    await this.context?.close().catch(() => {});
    this.stream = undefined;
    this.context = undefined;
    this.worklet = undefined;
    await this.api.voiceCaptureReleased({ sessionId: this.request.sessionId }).catch(() => {});
  }
  async stop(finish: boolean): Promise<void> {
    if (this.cancelled || (finish && this.finishing)) return;
    if (!finish) {
      this.cancelled = true;
      for (const track of this.stream?.getTracks() ?? []) track.stop();
      await this.starting;
      await this.cleanup();
      return;
    }
    this.finishing = true;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.source?.disconnect();
    try {
      if (!this.worklet) throw Error();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error()), 1500);
        this.flushed = () => {
          clearTimeout(timer);
          resolve();
        };
        this.worklet?.port.postMessage("finish");
      });
      await this.queue;
      if (this.cancelled) return;
      await this.cleanup();
      await this.api.voiceFinish({
        sessionId: this.request.sessionId,
        nextSequence: this.sequence,
      });
    } catch {
      await this.fail("capture-failed");
    }
  }
}
