import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceController } from "../../src/main/voice/controller";
import type { VoiceModelStore } from "../../src/main/voice/model-store";
import { allowMicrophone } from "../../src/main/voice/permissions";
import type { VoiceSettingsStore } from "../../src/main/voice/settings";
import { DEFAULT_VOICE } from "../../src/shared/voice";

function setup() {
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
    snapshot: () => ({ ...DEFAULT_VOICE, enabled: true, modelId: "base.en" }),
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
