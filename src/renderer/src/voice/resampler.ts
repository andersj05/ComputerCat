// Streaming windowed-sinc resampler. History and fractional position survive render quanta.
export class PcmResampler {
  private history: number[] = [];
  private base = 0;
  private count = 0;
  private output = 0;
  private finished = false;
  private readonly radius = 64;
  constructor(private readonly rate: number) {
    if (!Number.isFinite(rate) || rate < 16000 || rate > 192000) throw Error("sample rate");
  }
  push(channels: readonly Float32Array[]): number[] {
    if (this.finished) throw Error("finished");
    const n = channels[0]?.length ?? 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (const c of channels) v += Number.isFinite(c[i]) ? (c[i] ?? 0) : 0;
      this.history.push(v / Math.max(1, channels.length));
    }
    this.count += n;
    return this.produce(false);
  }
  finish(): number[] {
    if (this.finished) return [];
    this.finished = true;
    return this.produce(true);
  }
  private produce(flush: boolean): number[] {
    const result: number[] = [];
    const step = this.rate / 16000;
    const cutoff = 0.45 / step;
    while (this.output < Math.floor(this.count / step)) {
      const center = this.output * step;
      if (!flush && center + this.radius >= this.count) break;
      let sum = 0,
        weight = 0;
      const left = Math.ceil(center - this.radius),
        right = Math.floor(center + this.radius);
      for (let i = left; i <= right; i++) {
        const d = i - center;
        const x = 2 * Math.PI * cutoff * d;
        const kernel =
          (Math.abs(x) < 1e-10 ? 1 : Math.sin(x) / x) *
          (0.5 + 0.5 * Math.cos((Math.PI * d) / this.radius));
        weight += kernel;
        sum += (this.history[i - this.base] ?? 0) * kernel;
      }
      const v = Math.max(-1, Math.min(1, sum / weight));
      result.push(Math.round(v < 0 ? v * 32768 : v * 32767));
      this.output++;
    }
    const discard = Math.max(0, Math.floor(this.output * step) - this.radius - this.base);
    if (discard) {
      this.history.splice(0, discard);
      this.base += discard;
    }
    return result;
  }
}
