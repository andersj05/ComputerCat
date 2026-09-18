import { z } from "zod";
import { VOICE, VoiceError, voiceErrorSchema } from "../../shared/voice";

const id = z.uuid();
const base = { version: z.literal(1) };
export const helperMessage = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("hello"),
    buildId: z.literal("computercat-whisper-1"),
    engine: z.literal("1.9.4"),
    backend: z.literal("cpu"),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("ready"),
    requestId: id,
    modelId: z.enum(["base.en", "large-v3-turbo"]),
    backend: z.literal("cpu"),
    loadMs: z.number().min(0).max(VOICE.loadMs),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("result"),
    requestId: id,
    text: z.string().max(VOICE.maxText),
    language: z.string().regex(/^[a-z]{2,3}$/),
    audioMs: z.number().min(0).max(VOICE.captureMs),
    inferenceMs: z.number().min(0).max(VOICE.inferenceMs),
  }),
  z.strictObject({ ...base, kind: z.enum(["no-speech", "cancelled"]), requestId: id }),
  z.strictObject({ ...base, kind: z.literal("error"), requestId: id, code: voiceErrorSchema }),
]);
export type HelperMessage = z.infer<typeof helperMessage>;
export function frame(control: object, payload: Uint8Array = new Uint8Array()): Buffer {
  const json = Buffer.from(JSON.stringify({ ...control, version: 1 }));
  if (json.length > 32768 || payload.byteLength > VOICE.totalBytes)
    throw new VoiceError("protocol-error");
  const result = Buffer.allocUnsafe(json.length + payload.byteLength + 8);
  result.writeUInt32LE(json.length, 0);
  json.copy(result, 4);
  result.writeUInt32LE(payload.byteLength, json.length + 4);
  result.set(payload, json.length + 8);
  return result;
}
// Output contains flat objects only. Counting decoded keys rejects escaped duplicate names too.
function parseControl(bytes: Buffer): HelperMessage {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(raw);
  const names: string[] = [];
  // Consume every complete JSON string token, including values, before looking for a colon.
  const tokens = /"(?:[^"\\]|\\.)*"/g;
  for (const token of raw.matchAll(tokens)) {
    if (
      raw
        .slice((token.index ?? 0) + token[0].length)
        .trimStart()
        .startsWith(":")
    )
      names.push(JSON.parse(token[0]));
  }
  if (new Set(names).size !== names.length) throw new VoiceError("protocol-error");
  return helperMessage.parse(value);
}
export class FrameParser {
  private buffer = Buffer.alloc(0);
  private failed = false;
  push(input: Uint8Array): HelperMessage[] {
    if (this.failed) throw new VoiceError("protocol-error");
    const messages: HelperMessage[] = [];
    try {
      // Process in bounded increments even if a hostile process writes a huge chunk.
      for (let offset = 0; offset < input.length; offset += 4096) {
        this.buffer = Buffer.concat([this.buffer, input.subarray(offset, offset + 4096)]);
        while (this.buffer.length >= 4) {
          const size = this.buffer.readUInt32LE();
          if (!size || size > 65536) throw new Error();
          if (this.buffer.length < size + 8) break;
          if (this.buffer.readUInt32LE(size + 4) !== 0) throw new Error();
          messages.push(parseControl(this.buffer.subarray(4, size + 4)));
          if (messages.length > 16) throw new Error();
          this.buffer = this.buffer.subarray(size + 8);
        }
      }
      return messages;
    } catch {
      this.failed = true;
      this.buffer = Buffer.alloc(0);
      throw new VoiceError("protocol-error");
    }
  }
  end(): void {
    if (this.buffer.length) throw new VoiceError("protocol-error");
  }
}
