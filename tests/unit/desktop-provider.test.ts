import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sources: vi.fn(),
  windows: vi.fn(),
  inspect: vi.fn(),
  current: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("electron", () => ({
  desktopCapturer: { getSources: mocks.sources },
  BrowserWindow: { getAllWindows: mocks.windows },
}));
vi.mock("../../src/main/desktop/windows-reader", () => ({
  inspectWindow: mocks.inspect,
  inspectCurrentWindow: mocks.current,
}));

import { ElectronDesktopProvider } from "../../src/main/desktop/electron-provider";

const fixture = { id: "window:123:0", name: "Fixture", kind: "window" as const };
const thumb = (text: string) => ({
  isEmpty: () => false,
  getSize: () => ({ width: 640, height: 480 }),
  toPNG: () => Buffer.from(text),
});
function setup() {
  mocks.windows.mockReturnValue([]);
  mocks.sources.mockResolvedValue([
    { ...fixture, thumbnail: thumb("selected") },
    { id: "window:456:0", name: "Other", thumbnail: thumb("other-window") },
    { id: "screen:0:0", name: "Screen 1", thumbnail: thumb("screen") },
  ]);
  mocks.inspect.mockResolvedValue({
    title: "Fixture",
    app: "Test",
    text: "text",
    selectedText: "",
    tabs: [],
    truncated: false,
  });
  mocks.capture.mockResolvedValue({
    data: Buffer.from("selected").toString("base64"),
    width: 640,
    height: 480,
  });
  return {
    provider: new ElectronDesktopProvider({ capture: mocks.capture }),
    abort: new AbortController(),
  };
}
afterEach(() => vi.resetAllMocks());

describe("Electron desktop adapter", () => {
  it("resolves the native current app to an opaque broker source without leaking its handle", async () => {
    const { provider, abort } = setup();
    mocks.current.mockResolvedValue({
      ...(await mocks.inspect()),
      nativeWindowId: "123",
      target: "behind-assistant",
    });
    const result = await provider.current(abort.signal);
    expect(result).toMatchObject({
      source: fixture,
      target: "behind-assistant",
      text: { text: "text" },
    });
    expect(result?.text).not.toHaveProperty("nativeWindowId");
    expect(mocks.current).toHaveBeenCalledWith(abort.signal);
    expect(mocks.sources.mock.calls[0]?.[0].thumbnailSize).toEqual({ width: 0, height: 0 });
  });

  it.each(["closed", "renamed", "unknown"])(
    "does not substitute another window when the current target is %s",
    async (reason) => {
      const { provider, abort } = setup();
      mocks.current.mockResolvedValue({
        ...(await mocks.inspect()),
        nativeWindowId: reason === "closed" ? "999" : reason === "unknown" ? undefined : "123",
        target: "foreground",
        ...(reason === "renamed" ? { title: "New title" } : {}),
      });
      expect(await provider.current(abort.signal)).toBeUndefined();
    },
  );

  it("keeps the current source available for capture when its text is inaccessible", async () => {
    const { provider, abort } = setup();
    mocks.current.mockResolvedValue({
      title: "",
      app: "",
      text: "",
      selectedText: "",
      tabs: [],
      truncated: false,
      unavailableReason: "Unavailable",
      nativeWindowId: "123",
      target: "foreground",
    });
    expect(await provider.current(abort.signal)).toMatchObject({
      source: fixture,
      text: { unavailableReason: "Unavailable" },
    });
  });

  it("lists without pixels or icons and excludes our own native windows", async () => {
    const { provider, abort } = setup();
    const handle = Buffer.alloc(8);
    handle.writeBigUInt64LE(456n);
    mocks.windows.mockReturnValue([
      { isDestroyed: () => false, getNativeWindowHandle: () => handle },
    ]);
    const sources = await provider.list(abort.signal);
    expect(sources.map((source) => source.id)).toEqual(["window:123:0", "screen:0:0"]);
    expect(mocks.sources).toHaveBeenCalledWith({
      types: ["window", "screen"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    expect(JSON.stringify(sources)).not.toContain("thumbnail");
  });

  it("captures only the requested matching window result", async () => {
    const { provider, abort } = setup();
    expect(await provider.capture(fixture, abort.signal)).toEqual({
      data: Buffer.from("selected").toString("base64"),
      width: 640,
      height: 480,
    });
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(fixture.id, abort.signal);
    expect(
      mocks.sources.mock.calls.every(
        ([options]) => options.thumbnailSize.width === 0 && options.thumbnailSize.height === 0,
      ),
    ).toBe(true);
  });

  it.each(["changed", "closed", "protected"])("fails closed for %s captures", async (reason) => {
    const { provider, abort } = setup();
    const thumbnail = thumb("selected");
    if (reason === "protected") mocks.capture.mockRejectedValue(new Error("No frame"));
    mocks.sources.mockResolvedValue(
      reason === "closed"
        ? []
        : [{ ...fixture, name: reason === "changed" ? "New title" : fixture.name, thumbnail }],
    );
    await expect(provider.capture(fixture, abort.signal)).rejects.toThrow();
  });

  it("drops a frame if the source changes during capture", async () => {
    const { provider, abort } = setup();
    mocks.capture.mockImplementation(async () => {
      mocks.sources.mockResolvedValue([{ ...fixture, name: "Different page" }]);
      return { data: "cG5n", width: 20, height: 20 };
    });
    await expect(provider.capture(fixture, abort.signal)).rejects.toThrow("changed");
  });

  it("rejects capture of Computer Cat after a source becomes ours", async () => {
    const { provider, abort } = setup();
    const handle = Buffer.alloc(4);
    handle.writeUInt32LE(123);
    mocks.windows.mockReturnValue([
      { isDestroyed: () => false, getNativeWindowHandle: () => handle },
    ]);
    await expect(provider.capture(fixture, abort.signal)).rejects.toThrow();
  });

  it("revalidates title/identity before reading and forwards only a numeric handle", async () => {
    const { provider, abort } = setup();
    await provider.read(fixture, abort.signal);
    expect(mocks.inspect).toHaveBeenCalledWith("123", abort.signal);
    mocks.sources.mockResolvedValue([{ ...fixture, name: "Another window" }]);
    await expect(provider.read(fixture, abort.signal)).rejects.toThrow();
    expect(mocks.inspect).toHaveBeenCalledOnce();
  });

  it("rejects changed window identity after accessibility reading", async () => {
    const { provider, abort } = setup();
    mocks.inspect.mockResolvedValue({ title: "New window" });
    await expect(provider.read(fixture, abort.signal)).rejects.toThrow();
  });

  it("aborts before OS access and discards capture results cancelled during enumeration", async () => {
    const { provider, abort } = setup();
    abort.abort();
    await expect(provider.list(abort.signal)).rejects.toThrow();
    await expect(provider.capture(fixture, abort.signal)).rejects.toThrow();
    expect(mocks.sources).not.toHaveBeenCalled();
    const later = new AbortController();
    mocks.sources.mockImplementation(async () => {
      later.abort();
      return [{ ...fixture, thumbnail: thumb("private") }];
    });
    await expect(provider.capture(fixture, later.signal)).rejects.toThrow();
  });
});
