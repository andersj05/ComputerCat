import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor(options: unknown) {
      // biome-ignore lint/correctness/noConstructorReturn: Electron's constructor is replaced by a controlled test window.
      return mocks.create(options);
    }
  },
}));

import { SourceCapturer } from "../../src/main/desktop/source-capture";

const documentPath = resolve("fixture", "capture.html");
const url = pathToFileURL(documentPath).href;
function setup() {
  let destroyed = false;
  const session = {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    webRequest: { onBeforeRequest: vi.fn() },
  };
  const contents = Object.assign(new EventEmitter(), {
    session,
    isDestroyed: () => destroyed,
    getURL: () => url,
    executeJavaScript: vi.fn().mockResolvedValue({ data: "cG5n", width: 640, height: 480 }),
    setWindowOpenHandler: vi.fn(),
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => destroyed,
    loadFile: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(() => {
      destroyed = true;
      window.emit("closed");
    }),
  });
  mocks.create.mockReturnValue(window);
  const capturer = new SourceCapturer(documentPath);
  const abort = new AbortController();
  return {
    capturer,
    abort,
    contents,
    window,
    session,
    capture: () => capturer.capture("window:123:0", abort.signal),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("selected-source media capture", () => {
  it("creates a hidden sandbox, returns bounded pixels, and destroys its media owner", async () => {
    const { capture, window, contents, session } = setup();
    expect(await capture()).toEqual({ data: "cG5n", width: 640, height: 480 });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        show: false,
        focusable: false,
        webPreferences: expect.objectContaining({
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          offscreen: true,
        }),
      }),
    );
    expect(contents.executeJavaScript.mock.calls[0]?.[0]).toContain('"window:123:0"');
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(session.setPermissionCheckHandler.mock.calls.at(-1)?.[0]()).toBe(false);
  });

  it("grants only the fixed owner frame's desktop request, never physical audio/video devices", async () => {
    const { capture, contents, session } = setup();
    contents.executeJavaScript.mockImplementation(async () => {
      const request = session.setPermissionRequestHandler.mock.calls[0]?.[0];
      const check = session.setPermissionCheckHandler.mock.calls[0]?.[0];
      const details = { requestingUrl: url, isMainFrame: true, mediaTypes: [] };
      const allowed = vi.fn();
      request(contents, "media", allowed, details);
      expect(allowed).toHaveBeenLastCalledWith(true);
      for (const patch of [
        { mediaTypes: ["audio"] },
        { mediaTypes: ["video"] },
        { isMainFrame: false },
        { requestingUrl: "https://example.com" },
        { mediaTypes: undefined },
      ]) {
        request(contents, "media", allowed, { ...details, ...patch });
        expect(allowed).toHaveBeenLastCalledWith(false);
      }
      request({}, "media", allowed, details);
      expect(allowed).toHaveBeenLastCalledWith(false);
      expect(
        check(contents, "media", "file:///", {
          isMainFrame: true,
          requestingUrl: "",
          mediaType: "video",
        }),
      ).toBe(true);
      expect(
        check(contents, "media", "file:///", {
          isMainFrame: false,
          requestingUrl: "",
          mediaType: "video",
        }),
      ).toBe(false);
      expect(
        check(contents, "media", "file:///", {
          isMainFrame: true,
          requestingUrl: "",
          mediaType: "audio",
        }),
      ).toBe(false);
      const network = session.webRequest.onBeforeRequest.mock.calls[0]?.[0];
      network({ url: "https://example.com" }, allowed);
      expect(allowed).toHaveBeenLastCalledWith({ cancel: true });
      return { data: "cG5n", width: 10, height: 10 };
    });
    await capture();
  });

  it.each(["cancel", "deadline", "crash"])(
    "destroys a stalled media owner on %s without returning late images",
    async (reason) => {
      vi.useFakeTimers();
      const { capture, capturer, abort, window, contents } = setup();
      contents.executeJavaScript.mockImplementation(() => new Promise(() => {}));
      const pending = capture();
      const failure = expect(pending).rejects.toHaveProperty(
        "code",
        reason === "cancel" ? "cancelled" : reason === "deadline" ? "timeout" : "unavailable",
      );
      await expect(
        capturer.capture("window:456:0", new AbortController().signal),
      ).rejects.toHaveProperty("code", "busy");
      await vi.advanceTimersByTimeAsync(0);
      if (reason === "cancel") abort.abort();
      if (reason === "deadline") await vi.advanceTimersByTimeAsync(6_001);
      if (reason === "crash") contents.emit("render-process-gone");
      await failure;
      expect(window.destroy).toHaveBeenCalledOnce();
    },
  );

  it("rejects arbitrary IDs and pre-cancelled requests before creating a renderer", async () => {
    const { capturer, abort, capture } = setup();
    await expect(capturer.capture('window:1:0";code', abort.signal)).rejects.toHaveProperty(
      "code",
      "unavailable",
    );
    abort.abort();
    await expect(capture()).rejects.toHaveProperty("code", "cancelled");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects invalid crop bounds before creating a media renderer", async () => {
    const { capturer, abort } = setup();
    await expect(
      capturer.capture("window:123:0", abort.signal, { x: 0.8, y: 0, width: 0.3, height: 1 }),
    ).rejects.toHaveProperty("code", "unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    { data: "cG5n", width: 3840, height: 1080 },
    { data: "invalid@", width: 1, height: 1 },
    { data: "x".repeat(8_000_001), width: 1, height: 1 },
  ])("rejects invalid or oversized frames %#", async (value) => {
    const { capture, contents, window } = setup();
    contents.executeJavaScript.mockResolvedValue(value);
    await expect(capture()).rejects.toHaveProperty("code", "unavailable");
    expect(window.destroy).toHaveBeenCalledOnce();
  });
});
