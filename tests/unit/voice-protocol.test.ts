import { describe, expect, it } from "vitest";
import { FrameParser, frame } from "../../src/main/voice/helper-protocol";

const hello = { kind: "hello", buildId: "computercat-whisper-1", engine: "1.9.4", backend: "cpu" };
describe("Whisper frame boundary", () => {
  it("accepts split and concatenated frames", () => {
    const parser = new FrameParser();
    const bytes = frame(hello);
    for (const byte of bytes.subarray(0, bytes.length - 1))
      expect(parser.push(Buffer.from([byte]))).toEqual([]);
    expect(parser.push(bytes.subarray(-1))).toEqual([{ ...hello, version: 1 }]);
    expect(parser.push(Buffer.concat([bytes, bytes]))).toHaveLength(2);
    parser.end();
  });
  it("preserves quoted transcript text containing colons", () => {
    const result = {
      kind: "result",
      requestId: "00000000-0000-4000-8000-000000000000",
      text: 'Say "key": one, "key": two.',
      language: "en",
      audioMs: 1000,
      inferenceMs: 5,
    };
    expect(new FrameParser().push(frame(result))[0]).toEqual({ ...result, version: 1 });
  });
  it("rejects oversized, truncated, noisy and nonzero payload frames", () => {
    for (const bytes of [
      Buffer.from([255, 255, 255, 127]),
      Buffer.from("noise"),
      frame(hello, Buffer.from([1])),
    ])
      expect(() => new FrameParser().push(bytes)).toThrow("protocol-error");
    const parser = new FrameParser();
    parser.push(frame(hello).subarray(0, 8));
    expect(() => parser.end()).toThrow();
  });
  it("rejects unexpected properties, versions, duplicate keys and invalid UTF-8", () => {
    for (const raw of [
      JSON.stringify({ ...hello, version: 2 }),
      JSON.stringify({ ...hello, version: 1, surprise: true }),
      '{"kind":"hello","kind":"hello"}',
      '{"x":"a","\\u0078":"b"}',
    ]) {
      const data = Buffer.from(raw);
      const bytes = Buffer.alloc(data.length + 8);
      bytes.writeUInt32LE(data.length);
      data.copy(bytes, 4);
      expect(() => new FrameParser().push(bytes)).toThrow("protocol-error");
    }
    expect(() => new FrameParser().push(Buffer.from([1, 0, 0, 0, 255, 0, 0, 0, 0]))).toThrow();
  });
});
