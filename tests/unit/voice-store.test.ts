import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Asset, VoiceModelStore } from "../../src/main/voice/model-store";
import { VoiceSettingsStore } from "../../src/main/voice/settings";
import { DEFAULT_VOICE } from "../../src/shared/voice";

const dirs: string[] = [];
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "computercat-voice-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    if (!dir.startsWith(join(tmpdir(), "computercat-voice-"))) throw Error("Unsafe cleanup");
    await rm(dir, { recursive: true, force: true });
  }
});
const data = Buffer.from("verified model bytes");
const assets: Asset[] = ["base.en", "silero-v6.2.0"].map((id) => ({
  id,
  label: id,
  family: "whisper",
  format: "ggml",
  revision: "a".repeat(40),
  filename: "model.bin",
  bytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
  url: "https://example.test/model",
  languages: ["en"],
  vad: "silero-v6.2.0",
  license: "MIT",
  source: "https://example.test",
}));
describe("voice model storage and preferences", () => {
  it("streams, verifies, atomically installs and removes only selected assets", async () => {
    const dir = await directory();
    const store = new VoiceModelStore(
      dir,
      async () =>
        (async function* () {
          yield data.subarray(0, 3);
          yield data.subarray(3);
        })(),
      assets,
    );
    await store.install("base.en", new AbortController().signal, () => {});
    expect(await store.installed()).toEqual(["base.en", "silero-v6.2.0"]);
    expect((await store.prepare("base.en", new AbortController().signal)).modelId).toBe("base.en");
    await store.remove("base.en");
    expect(await store.installed()).toEqual(["silero-v6.2.0"]);
  });
  it("rejects corruption without publishing ready files", async () => {
    const dir = await directory();
    const store = new VoiceModelStore(
      dir,
      async () =>
        (async function* () {
          yield Buffer.alloc(data.length);
        })(),
      assets,
    );
    await expect(store.install("base.en", new AbortController().signal, () => {})).rejects.toThrow(
      "integrity-failed",
    );
    expect(await store.installed()).toEqual([]);
  });
  it("does not replace a good installed model during a cancelled VAD download", async () => {
    const dir = await directory();
    await mkdir(join(dir, "base.en"));
    await writeFile(join(dir, "base.en", "model.bin"), data);
    const abort = new AbortController();
    const store = new VoiceModelStore(
      dir,
      async () =>
        (async function* () {
          abort.abort();
          yield data;
        })(),
      assets,
    );
    await expect(store.install("base.en", abort.signal, () => {})).rejects.toThrow("cancelled");
    expect(await readFile(join(dir, "base.en", "model.bin"))).toEqual(data);
  });
  it("defaults to disabled, validates language, and keeps saved settings on failure", async () => {
    const dir = await directory();
    const path = join(dir, "voice.json");
    const store = new VoiceSettingsStore(path);
    await store.load();
    expect(store.snapshot()).toEqual(DEFAULT_VOICE);
    await expect(
      store.update({ ...DEFAULT_VOICE, modelId: "base.en", language: "auto" }),
    ).rejects.toThrow();
    await store.update({ ...DEFAULT_VOICE, enabled: true });
    const restored = new VoiceSettingsStore(path);
    await restored.load();
    expect(restored.snapshot().enabled).toBe(true);
    await writeFile(path, "broken");
    await restored.load();
    expect(restored.snapshot().enabled).toBe(false);
    expect(restored.notice).toBe(true);
    const blocked = new VoiceSettingsStore(join(path, "voice.json"));
    await expect(blocked.update({ ...DEFAULT_VOICE, enabled: true })).rejects.toThrow();
    expect(blocked.snapshot().enabled).toBe(false);
  });
});
