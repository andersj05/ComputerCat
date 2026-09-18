import { PcmResampler } from "./resampler";

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
class PcmProcessor extends AudioWorkletProcessor {
  private converter = new PcmResampler(sampleRate);
  private samples: number[] = [];
  private outstanding = 0;
  private stopped = false;
  private started = false;
  constructor() {
    super();
    this.port.onmessage = (event) => {
      if (event.data === "ack") this.outstanding--;
      if (event.data === "finish" && !this.stopped) {
        this.stopped = true;
        this.samples.push(...this.converter.finish());
        this.emit(true);
        this.port.postMessage("flushed");
      }
      if (event.data === "cancel") {
        this.stopped = true;
        this.samples = [];
      }
    };
  }
  private emit(all = false) {
    while (this.samples.length >= 4000 || (all && this.samples.length)) {
      if (this.outstanding >= 4) {
        this.stopped = true;
        this.samples = [];
        this.port.postMessage("overrun");
        return;
      }
      const samples = this.samples.splice(0, 4000);
      const bytes = new Uint8Array(samples.length * 2);
      const view = new DataView(bytes.buffer);
      samples.forEach((v, i) => {
        view.setInt16(i * 2, v, true);
      });
      this.outstanding++;
      this.port.postMessage(bytes, [bytes.buffer]);
    }
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    for (const channel of outputs[0] ?? []) channel.fill(0);
    if (this.stopped) return true;
    const input = inputs[0];
    if (!input?.length) return true;
    if (!this.started) {
      this.started = true;
      this.port.postMessage("started");
    }
    this.samples.push(...this.converter.push(input));
    this.emit();
    return true;
  }
}
registerProcessor("computercat-pcm", PcmProcessor);
