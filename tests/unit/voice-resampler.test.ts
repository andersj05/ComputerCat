import { describe, expect, it } from "vitest";
import { PcmResampler } from "../../src/renderer/src/voice/resampler";

function convert(rate: number, frequency: number, split = 128) {
  const r = new PcmResampler(rate);
  const signal = Float32Array.from(
    { length: rate },
    (_, i) => Math.sin((2 * Math.PI * frequency * i) / rate) * 0.5,
  );
  const output: number[] = [];
  for (let i = 0; i < signal.length; i += split)
    output.push(...r.push([signal.subarray(i, i + split)]));
  output.push(...r.finish());
  return output;
}
describe("streaming microphone conversion", () => {
  for (const rate of [44100, 48000, 96000])
    it(`resamples ${rate} Hz with continuous phase and correct output length`, () => {
      const split = convert(rate, 1000);
      const whole = convert(rate, 1000, rate);
      expect(split).toHaveLength(16000);
      expect(split).toEqual(whole);
      expect(split.every(Number.isFinite)).toBe(true);
      const rms = (v: number[]) =>
        Math.sqrt(v.slice(100, -100).reduce((n, x) => n + x * x, 0) / (v.length - 200));
      expect(rms(split)).toBeGreaterThan(11000);
      expect(rms(convert(rate, 12000))).toBeLessThan(100);
    });
  it("downmixes channels, clamps and flushes once", () => {
    const r = new PcmResampler(48000);
    const positive = new Float32Array(4800).fill(3);
    const negative = new Float32Array(4800).fill(-3);
    const output = [...r.push([positive, negative]), ...r.finish()];
    expect(output).toHaveLength(1600);
    expect(output.every((x) => x === 0)).toBe(true);
    expect(r.finish()).toEqual([]);
  });
});
