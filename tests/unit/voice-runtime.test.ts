import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { helperEnvironment, WhisperRuntime } from "../../src/main/voice/whisper-runtime";
import { DEFAULT_VOICE } from "../../src/shared/voice";

const model = { modelId: "base.en" as const, modelPath: "fake-model", vadPath: "fake-vad" };
function runtime(mode = "") {
  return new WhisperRuntime("unused", () =>
    spawn(process.execPath, [resolve("tests/fixtures/voice-helper.mjs"), mode], {
      stdio: "pipe",
      windowsHide: true,
      env: helperEnvironment(process.env),
    }),
  );
}
describe("Whisper process supervision", () => {
  it("passes only allowlisted environment, loads once and transcribes independent utterances", async () => {
    expect(
      helperEnvironment({ SystemRoot: "Windows", OPENAI_API_KEY: "secret", PATH: "unsafe" }),
    ).toEqual({ SystemRoot: "Windows" });
    const r = runtime();
    const signal = new AbortController().signal;
    try {
      await r.prepare(model, DEFAULT_VOICE, signal);
      for (let i = 0; i < 2; i++)
        expect(await r.transcribe(new Uint8Array(32000), "en", signal)).toBe(
          "Do not delete the folder.",
        );
    } finally {
      await r.dispose();
    }
  });
  it("rejects CUDA without silently changing explicit selection", async () => {
    const r = runtime();
    await expect(
      r.prepare(model, { ...DEFAULT_VOICE, backend: "cuda" }, new AbortController().signal),
    ).rejects.toThrow("backend-unavailable");
  });
  it("recovers after a crashing helper", async () => {
    const r = runtime("crash");
    const signal = new AbortController().signal;
    await r.prepare(model, DEFAULT_VOICE, signal);
    await expect(r.transcribe(new Uint8Array(32000), "en", signal)).rejects.toThrow(
      "helper-crashed",
    );
    await r.dispose();
  });
  it("cancels a hung inference and waits for process exit", async () => {
    const r = runtime("hang");
    const abort = new AbortController();
    await r.prepare(model, DEFAULT_VOICE, abort.signal);
    const result = r.transcribe(new Uint8Array(32000), "en", abort.signal);
    abort.abort();
    await expect(result).rejects.toThrow("cancelled");
    await r.dispose();
  });
});
