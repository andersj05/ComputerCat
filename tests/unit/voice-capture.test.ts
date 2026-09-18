import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceCapture } from "../../src/renderer/src/voice/capture";
import type { VoiceAPI } from "../../src/shared/voice";

function fixture(getUserMedia: () => Promise<MediaStream>) {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(getUserMedia) } });
  const api = {
    voiceCaptureReleased: vi.fn(async () => ({ ok: true })),
    voiceCaptureFailed: vi.fn(async () => ({ ok: true })),
  };
  const capture = new VoiceCapture(
    { sessionId: "session", conversationId: "chat" },
    api as unknown as VoiceAPI,
  );
  return { capture, api };
}
afterEach(() => vi.unstubAllGlobals());
describe("microphone cleanup boundary", () => {
  it("stops a stream that resolves after cancellation", async () => {
    let resolve!: (stream: MediaStream) => void;
    const promise = new Promise<MediaStream>((r) => {
      resolve = r;
    });
    const stop = vi.fn();
    const { capture, api } = fixture(() => promise);
    capture.start();
    const cancelled = capture.stop(false);
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await cancelled;
    expect(stop).toHaveBeenCalled();
    expect(api.voiceCaptureFailed).not.toHaveBeenCalled();
    expect(api.voiceCaptureReleased).toHaveBeenCalled();
  });
  it("sanitizes denial and never retries", async () => {
    const { capture, api } = fixture(async () => {
      throw new DOMException("private device details", "NotAllowedError");
    });
    capture.start();
    await vi.waitFor(() =>
      expect(api.voiceCaptureFailed).toHaveBeenCalledWith({
        sessionId: "session",
        code: "permission-denied",
      }),
    );
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
  });
  it("closes tracks and context if the packaged worklet cannot load", async () => {
    const stop = vi.fn(),
      close = vi.fn(async () => {});
    vi.stubGlobal(
      "AudioContext",
      class {
        audioWorklet = {
          addModule: async () => {
            throw Error("load failed");
          },
        };
        close = close;
      },
    );
    const { capture, api } = fixture(
      async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream,
    );
    capture.start();
    await vi.waitFor(() =>
      expect(api.voiceCaptureFailed).toHaveBeenCalledWith({
        sessionId: "session",
        code: "capture-failed",
      }),
    );
    expect(stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
