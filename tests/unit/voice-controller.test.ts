import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceController } from "../../src/main/voice/controller";
import type { VoiceModelStore } from "../../src/main/voice/model-store";
import { allowMicrophone } from "../../src/main/voice/permissions";
import type { VoiceSettingsStore } from "../../src/main/voice/settings";
import { DEFAULT_VOICE } from "../../src/shared/voice";

function setup(enabled = true) {
  vi.useFakeTimers();
  let now = 1000;
  const capture = vi.fn();
  const stop = vi.fn();
  const terminateCapture = vi.fn();
  const runtime = {
    prepare: vi.fn(async () => {}),
    transcribe: vi.fn(async () => "Do not delete."),
    dispose: vi.fn(async () => {}),
  };
  const store = {
    installed: async () => ["base.en"],
    prepare: async () => ({ modelId: "base.en", modelPath: "model", vadPath: "vad" }),
  } as unknown as VoiceModelStore;
  const settings = {
    snapshot: () => ({ ...DEFAULT_VOICE, enabled, modelId: "base.en" }),
    update: async () => {},
  } as unknown as VoiceSettingsStore;
  const voice = new VoiceController(
    settings,
    store,
    runtime,
    {
      conversation: () => "chat",
      agentBusy: () => false,
      visible: () => true,
      changed: () => {},
      capture,
      stop,
      terminateCapture,
    },
    () => now,
  );
  return {
    voice,
    runtime,
    capture,
    stop,
    terminateCapture,
    advance: () => {
      now += 1000;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("voice session boundary", () => {
  it("keeps background preparation running through chat and Options transitions", async () => {
    const { voice, runtime, capture } = setup();
    await voice.refresh();
    let ready!: () => void;
    let signal!: AbortSignal;
    runtime.prepare.mockImplementationOnce(async (...args: unknown[]) => {
      signal = args[2] as AbortSignal;
      await new Promise<void>((resolve) => {
        ready = resolve;
      });
    });
    const warming = voice.warm();
    await vi.advanceTimersByTimeAsync(0);
    const showOptions = vi.fn();
    await voice.transition(showOptions);
    expect(showOptions).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(false);
    ready();
    await warming;
    expect(voice.snapshot().availability).toBe("ready");
    expect(capture).not.toHaveBeenCalled();
    await voice.dispose();
  });
  it("releases the microphone but reuses a loaded model after cancelling a recording", async () => {
    const { voice, runtime } = setup();
    await voice.start("pet");
    const sessionId = voice.snapshot().sessionId ?? "missing";
    voice.captureStarted({ sessionId });
    voice.released({ sessionId });
    await voice.cancel();
    expect(voice.permissionGranted).toBe(false);
    expect(voice.busy).toBe(false);
    expect(runtime.dispose).not.toHaveBeenCalled();
    await voice.dispose();
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });
  it("releases models on lock/sleep and preloads only after both blocks clear", async () => {
    const { voice, runtime, capture } = setup();
    await voice.refresh();
    await voice.warm();
    await voice.setBlocked("locked", true);
    await voice.setBlocked("suspended", true);
    await expect(voice.start()).rejects.toThrow("busy");
    await voice.setBlocked("suspended", false);
    expect(runtime.prepare).toHaveBeenCalledTimes(1);
    await voice.setBlocked("locked", false);
    await voice.warm();
    expect(runtime.prepare).toHaveBeenCalledTimes(2);
    expect(capture).not.toHaveBeenCalled();
    await voice.dispose();
    await voice.warm();
    expect(runtime.prepare).toHaveBeenCalledTimes(2);
  });
  it("does not preload disabled voice and permits retry after a failed warm-up", async () => {
    const disabled = setup(false);
    await disabled.voice.refresh();
    await disabled.voice.warm();
    expect(disabled.runtime.prepare).not.toHaveBeenCalled();
    expect(disabled.voice.permissionGranted).toBe(false);
    const { voice, runtime, capture } = setup();
    runtime.prepare.mockRejectedValueOnce(new Error("load failed"));
    await voice.refresh();
    await voice.warm();
    expect(voice.snapshot().availability).toBe("unavailable");
    expect(capture).not.toHaveBeenCalled();
    await voice.start("pet");
    expect(capture).toHaveBeenCalledOnce();
    voice.released({ sessionId: voice.snapshot().sessionId });
    await voice.dispose();
  });
  it("serializes transcript previews with Finish and keeps pet text with its owner", async () => {
    const { voice, runtime, advance } = setup();
    let preview!: (text: string) => void;
    runtime.transcribe.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          preview = resolve;
        }),
    );
    await voice.start("pet");
    const sessionId = voice.snapshot().sessionId ?? "missing";
    voice.captureStarted({ sessionId });
    for (let sequence = 0; sequence < 8; sequence++) {
      advance();
      voice.append({ sessionId, sequence, pcm: new Uint8Array(16000) });
    }
    expect(runtime.transcribe).toHaveBeenCalledOnce();
    preview("Still speaking");
    await Promise.resolve();
    await Promise.resolve();
    expect(voice.snapshot(false).partial).toBe("Still speaking");
    expect(voice.snapshot().transcript).toBeUndefined();
    voice.requestFinish({ sessionId });
    voice.released({ sessionId });
    await voice.finish({ sessionId, nextSequence: 8 });
    expect(runtime.transcribe).toHaveBeenCalledTimes(2);
    expect(voice.snapshot(false).transcript).toBe("Do not delete.");
    expect(voice.snapshot(false).partial).toBeUndefined();
    expect(voice.snapshot(false).settings).toBeUndefined();
    voice.consumed({ sessionId });
  });
  it("does not overlap final inference with an unfinished preview or publish it after cancel", async () => {
    const { voice, runtime, advance } = setup();
    let preview!: (text: string) => void;
    runtime.transcribe.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          preview = resolve;
        }),
    );
    await voice.start("pet");
    const sessionId = voice.snapshot().sessionId ?? "missing";
    voice.captureStarted({ sessionId });
    for (let sequence = 0; sequence < 8; sequence++) {
      advance();
      voice.append({ sessionId, sequence, pcm: new Uint8Array(16000) });
    }
    voice.requestFinish({ sessionId });
    voice.released({ sessionId });
    const finish = voice.finish({ sessionId, nextSequence: 8 });
    expect(runtime.transcribe).toHaveBeenCalledOnce();
    await voice.cancel();
    preview("Late words");
    await finish;
    expect(voice.snapshot().partial).toBeUndefined();
    expect(voice.snapshot().transcript).toBeUndefined();
    expect(runtime.transcribe).toHaveBeenCalledOnce();
  });
  it("preloads without a microphone grant and shares an in-flight load with Talk", async () => {
    const { voice, runtime, capture } = setup();
    await voice.refresh();
    let ready!: () => void;
    runtime.prepare.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    const warming = voice.warm();
    await vi.advanceTimersByTimeAsync(0);
    expect(voice.permissionGranted).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    const start = voice.start("pet");
    expect(voice.snapshot().owner).toBe("pet");
    ready();
    await warming;
    await start;
    expect(capture).toHaveBeenCalledOnce();
    expect(voice.permissionGranted).toBe(true);
    voice.released({ sessionId: voice.snapshot().sessionId });
    await voice.dispose();
  });
  it("requires released capture and exact sequence before inference, returns review without Send", async () => {
    const { voice, runtime, advance } = setup();
    await voice.start();
    const sessionId = voice.snapshot().sessionId ?? "missing";
    voice.captureStarted({ sessionId });
    advance();
    voice.append({ sessionId, sequence: 0, pcm: new Uint8Array(16000) });
    voice.requestFinish({ sessionId });
    voice.released({ sessionId });
    await voice.finish({ sessionId, nextSequence: 1 });
    expect(runtime.transcribe).toHaveBeenCalledOnce();
    expect(voice.snapshot().transcript).toBe("Do not delete.");
    expect(voice.snapshot(false).transcript).toBeUndefined();
    voice.consumed({ sessionId });
    expect(voice.snapshot().phase).toBe("idle");
  });
  it("revokes permission immediately and escalates a hung capture owner", async () => {
    const { voice, terminateCapture } = setup();
    await voice.start();
    expect(voice.permissionGranted).toBe(true);
    const cancel = voice.cancel();
    expect(voice.permissionGranted).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    await cancel;
    expect(terminateCapture).toHaveBeenCalledOnce();
    expect(voice.busy).toBe(false);
  });
  it("rejects duplicate chunks and discards the session", async () => {
    const { voice, advance, runtime } = setup();
    await voice.start();
    const sessionId = voice.snapshot().sessionId ?? "missing";
    voice.captureStarted({ sessionId });
    advance();
    voice.append({ sessionId, sequence: 0, pcm: new Uint8Array(16000) });
    expect(() => voice.append({ sessionId, sequence: 0, pcm: new Uint8Array(16000) })).toThrow();
    voice.released({ sessionId });
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.transcribe).not.toHaveBeenCalled();
    expect(voice.snapshot().phase).toBe("idle");
  });
  it("keeps cancellation during model loading out of the error state", async () => {
    const { voice, runtime } = setup();
    let reject!: (error: Error) => void;
    runtime.prepare.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const loading = voice.start();
    await vi.advanceTimersByTimeAsync(0);
    await voice.cancel();
    reject(new Error("aborted load"));
    await loading;
    expect(voice.snapshot().phase).toBe("idle");
    expect(voice.snapshot().error).toBeUndefined();
  });
  it("reserves transitions before awaiting and rejects simultaneous Talk", async () => {
    const { voice } = setup();
    let release!: () => void;
    const change = voice.transition(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    await expect(voice.start()).rejects.toThrow("busy");
    await vi.advanceTimersByTimeAsync(0);
    release();
    await change;
  });
  it("discards a late result after cancellation", async () => {
    const { voice, runtime, advance } = setup();
    let resolve!: (v: string) => void;
    runtime.transcribe.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await voice.start();
    const sessionId = voice.snapshot().sessionId ?? "missing";
    voice.captureStarted({ sessionId });
    advance();
    voice.append({ sessionId, sequence: 0, pcm: new Uint8Array(16000) });
    voice.requestFinish({ sessionId });
    voice.released({ sessionId });
    const result = voice.finish({ sessionId, nextSequence: 1 });
    await voice.cancel();
    resolve("late");
    await result;
    expect(voice.snapshot().transcript).toBeUndefined();
  });
});
describe("microphone policy", () => {
  const chat = { id: 1, url: "file:///app/index.html?view=chat" };
  const owner = { ...chat, destroyed: false, mainFrame: true };
  const details = {
    requestingUrl: chat.url,
    isMainFrame: true,
    mediaTypes: ["audio"],
    mediaType: "audio",
  };
  it("only permits explicit audio for the exact chat frame during a grant", () => {
    for (const kind of ["request", "check"] as const) {
      expect(allowMicrophone(owner, chat, true, "media", details, kind)).toBe(true);
      for (const invalid of [
        null,
        { ...owner, id: 2 },
        { ...owner, mainFrame: false },
        { ...owner, url: "file:///evil" },
      ])
        expect(allowMicrophone(invalid, chat, true, "media", details, kind)).toBe(false);
      expect(allowMicrophone(owner, chat, false, "media", details, kind)).toBe(false);
      expect(
        allowMicrophone(
          owner,
          chat,
          true,
          "media",
          { ...details, mediaType: "unknown", mediaTypes: ["audio", "video"] },
          kind,
        ),
      ).toBe(false);
    }
  });
});
