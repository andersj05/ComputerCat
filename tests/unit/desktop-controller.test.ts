import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopController, type DesktopProvider } from "../../src/main/desktop/controller";
import { findWindowText } from "../../src/main/desktop/find-text";
import type { DesktopResult } from "../../src/shared/desktop";

function metadata(result: DesktopResult) {
  const part = result.content[0];
  if (part?.type !== "text") throw new Error("Expected metadata");
  return JSON.parse(part.text);
}
function setup() {
  let now = 1_000_000;
  const source = { id: "window:123:0", name: "Fixture page", kind: "window" as const };
  const text = {
    title: source.name,
    app: "Browser",
    text: "Useful page text",
    selectedText: "selected words",
    tabs: ["First tab"],
    pages: [{ title: "Example", url: "https://example.com/" }],
    controls: [{ role: "Button", name: "Save", enabled: false }],
    truncated: false,
  };
  const provider = {
    list: vi
      .fn<DesktopProvider["list"]>()
      .mockResolvedValue([source, { id: "screen:0:0", name: "Display", kind: "screen" }]),
    current: vi
      .fn<DesktopProvider["current"]>()
      .mockResolvedValue({ source, target: "behind-assistant", text }),
    capture: vi
      .fn<DesktopProvider["capture"]>()
      .mockResolvedValue({ data: "cG5n", width: 640, height: 480 }),
    read: vi.fn<DesktopProvider["read"]>().mockResolvedValue(text),
  };
  const controller = new DesktopController(provider, () => now);
  const abort = new AbortController();
  const list = async () =>
    metadata(await controller.execute({ operation: "list" }, abort.signal)).sources as {
      sourceId: string;
    }[];
  const observe = (screenshot = true) =>
    controller.execute({ operation: "observe", screenshot }, abort.signal);
  return {
    provider,
    controller,
    abort,
    list,
    observe,
    advance: () => {
      now += 60_001;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe("on-demand desktop harness", () => {
  it.each(["page", "controls"] as const)(
    "returns focused %s with provenance and no unrelated text",
    async (operation) => {
      const { controller, abort, provider, list, advance } = setup();
      const result = metadata(await controller.execute({ operation }, abort.signal));
      expect(result[operation === "page" ? "pages" : "controls"]).toHaveLength(1);
      expect(result.target).toBe("behind-assistant");
      expect(result.observedAt).toBeDefined();
      expect(result.text).toBeUndefined();
      expect(result.selectedText).toBeUndefined();
      expect(result.tabs).toBeUndefined();
      expect(provider.current).toHaveBeenCalledWith(expect.any(AbortSignal), operation);
      expect(provider.capture).not.toHaveBeenCalled();
      const sources = await list();
      const sourceId = sources[0]?.sourceId;
      await controller.execute({ operation, sourceId }, abort.signal);
      expect(provider.read).toHaveBeenCalledWith(
        expect.objectContaining({ id: "window:123:0" }),
        expect.any(AbortSignal),
        operation,
      );
      expect(
        (await controller.execute({ operation, sourceId: sources[1]?.sourceId }, abort.signal))
          .isError,
      ).toBe(true);
      advance();
      expect((await controller.execute({ operation, sourceId }, abort.signal)).isError).toBe(true);
      expect(provider.read).toHaveBeenCalledOnce();
    },
  );

  it("searches fresh exposed text and distinguishes truncated sources from further matches", async () => {
    const { controller, abort, provider } = setup();
    const current = await provider.current(abort.signal);
    if (!current) throw new Error("Missing fixture");
    provider.current.mockResolvedValue({
      ...current,
      text: { ...current.text, text: "Error [42] details. ".repeat(10), truncated: true },
    });
    const result = metadata(
      await controller.execute({ operation: "find-text", query: "error [42]" }, abort.signal),
    );
    expect(result.matches).toHaveLength(5);
    expect(result.matches[0]).toMatchObject({ offset: 0 });
    expect(result.hasMoreMatches).toBe(true);
    expect(result.sourceTruncated).toBe(true);
    expect(result.searchedCharacters).toBe(200);
    expect(result.text).toBeUndefined();
    expect(provider.current).toHaveBeenLastCalledWith(expect.any(AbortSignal), "all");
    expect(provider.capture).not.toHaveBeenCalled();
    const empty = metadata(
      await controller.execute({ operation: "find-text", query: "absent" }, abort.signal),
    );
    expect(empty.matches).toEqual([]);
    expect(empty.sourceTruncated).toBe(true);
  });

  it.each(["page", "controls", "find-text"] as const)(
    "blocks invalid/locked %s and suppresses a late result after Stop",
    async (operation) => {
      const { controller, abort, provider } = setup();
      const request = operation === "find-text" ? { operation, query: "text" } : { operation };
      expect(
        (await controller.execute({ ...request, command: "unexpected" }, abort.signal)).isError,
      ).toBe(true);
      controller.setBlocked("locked", true);
      expect((await controller.execute(request, abort.signal)).isError).toBe(true);
      expect(provider.current).not.toHaveBeenCalled();
      controller.setBlocked("locked", false);
      const fixture = await provider.current(abort.signal);
      let finish!: (value: typeof fixture) => void;
      provider.current.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = controller.execute(request, abort.signal);
      controller.cancel();
      finish(fixture);
      const stopped = await pending;
      expect(stopped.isError).toBe(true);
      expect(JSON.stringify(stopped)).not.toContain("Useful page text");
      expect(JSON.stringify(stopped)).not.toContain("example.com");
    },
  );

  it("rejects malformed search queries at the privileged boundary", async () => {
    const { controller, abort, provider } = setup();
    for (const query of ["", "  ", 42, "x".repeat(201), null]) {
      expect(
        (await controller.execute({ operation: "find-text", query }, abort.signal)).isError,
      ).toBe(true);
    }
    expect(provider.current).not.toHaveBeenCalled();
  });

  it("treats regex syntax literally and keeps Unicode match offsets aligned", () => {
    expect(findWindowText("a.*b aZZb", "a.*b").matches).toEqual([
      { offset: 0, excerpt: "a.*b aZZb" },
    ]);
    expect(findWindowText("İ 🐈 CAFÉ", "café").matches[0]?.offset).toBe(5);
  });
  it("does not recapture a failed native source after relisting, but allows a new turn", async () => {
    const { controller, provider, abort, list, observe } = setup();
    provider.capture.mockRejectedValue(new Error("private native error"));
    const first = await observe();
    expect(metadata(first).screenshotUnavailable).toContain("could not provide a frame");
    expect(first.isError).toBeUndefined(); // useful text survives
    const sourceId = (await list())[0]?.sourceId;
    const repeated = await controller.execute({ operation: "capture", sourceId }, abort.signal);
    expect(JSON.stringify(repeated)).toContain("already failed");
    expect(provider.capture).toHaveBeenCalledOnce();
    provider.capture.mockResolvedValue({ data: "cG5n", width: 100, height: 100 });
    expect(
      (
        await controller.execute(
          { operation: "observe", screenshot: true },
          new AbortController().signal,
        )
      ).content[1]?.type,
    ).toBe("image");
    expect(provider.capture).toHaveBeenCalledTimes(2);
  });
  it.each(["selection", "tabs"] as const)(
    "returns only %s from the current app or a listed window",
    async (operation) => {
      const { controller, abort, provider, list } = setup();
      const result = await controller.execute({ operation }, abort.signal);
      expect(provider.current).toHaveBeenCalledWith(expect.any(AbortSignal), operation);
      const content = metadata(result);
      expect(content[operation === "selection" ? "selectedText" : "tabs"]).toBeDefined();
      expect(content).not.toHaveProperty("text");
      expect(content).not.toHaveProperty(operation === "selection" ? "tabs" : "selectedText");
      expect(provider.capture).not.toHaveBeenCalled();
      const sourceId = (await list())[0]?.sourceId;
      await controller.execute({ operation, sourceId }, abort.signal);
      expect(provider.read).toHaveBeenCalledWith(
        expect.objectContaining({ id: "window:123:0" }),
        expect.any(AbortSignal),
        operation,
      );
    },
  );

  it("passes a valid region to the selected capture and rejects out-of-source rectangles", async () => {
    const { controller, abort, provider, list } = setup();
    const sourceId = (await list())[0]?.sourceId;
    const region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(
      metadata(
        await controller.execute({ operation: "capture-region", sourceId, region }, abort.signal),
      ).region,
    ).toEqual(region);
    expect(provider.capture).toHaveBeenCalledWith(
      expect.objectContaining({ id: "window:123:0" }),
      expect.any(AbortSignal),
      region,
    );
    for (const invalid of [
      { ...region, x: -1 },
      { ...region, width: 0 },
      { ...region, height: 1 },
      { ...region, x: Number.NaN },
    ])
      expect(
        (
          await controller.execute(
            { operation: "capture-region", sourceId, region: invalid },
            abort.signal,
          )
        ).isError,
      ).toBe(true);
    expect(provider.capture).toHaveBeenCalledOnce();
  });
  it("does nothing until a tool call, then observes the current page without a UI grant", async () => {
    const { provider, observe } = setup();
    expect(provider.current).not.toHaveBeenCalled();
    const result = await observe();
    expect(result.isError).toBeUndefined();
    expect(metadata(result)).toMatchObject({
      title: "Fixture page",
      target: "behind-assistant",
      window: { text: "Useful page text", selectedText: "selected words", tabs: ["First tab"] },
      width: 640,
      height: 480,
    });
    expect(result.content[1]).toEqual({ type: "image", data: "cG5n", mimeType: "image/png" });
    expect(provider.read).not.toHaveBeenCalled(); // current already read it
    expect(provider.list).not.toHaveBeenCalled();
  });
  it("returns text without capturing when requested", async () => {
    const { provider, observe } = setup();
    expect((await observe(false)).content).toHaveLength(1);
    expect(provider.capture).not.toHaveBeenCalled();
  });
  it("offers recovery when no current app can be identified", async () => {
    const { provider, observe } = setup();
    provider.current.mockResolvedValue(undefined);
    const result = await observe();
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("desktop_list_windows");
    expect(provider.capture).not.toHaveBeenCalled();
  });
  it("preserves useful text when capture fails", async () => {
    const { provider, observe } = setup();
    provider.capture.mockRejectedValue(new Error("private native detail"));
    const result = await observe();
    expect(result.isError).toBeUndefined();
    expect(metadata(result).window.text).toBe("Useful page text");
    expect(metadata(result).screenshotUnavailable).toContain("could not provide a frame");
    expect(JSON.stringify(result)).not.toContain("private native");
  });
  it("preserves screenshots when accessibility text fails, and reports total failure", async () => {
    const { provider, controller, abort, list } = setup();
    const sourceId = (await list())[0]?.sourceId;
    provider.read.mockRejectedValue(new Error("private provider failure"));
    const request = { operation: "observe", sourceId, screenshot: true };
    const result = await controller.execute(request, abort.signal);
    expect(result.isError).toBeUndefined();
    expect(result.content[1]?.type).toBe("image");
    expect(metadata(result).textUnavailable).toContain("unavailable");
    provider.capture.mockRejectedValue(new Error("private screenshot failure"));
    expect((await controller.execute(request, abort.signal)).isError).toBe(true);
  });
  it("issues source IDs for follow-ups within this turn only", async () => {
    const { controller, abort, observe, provider } = setup();
    const sourceId = metadata(await observe()).sourceId;
    expect(
      (await controller.execute({ operation: "read", sourceId }, abort.signal)).isError,
    ).toBeUndefined();
    expect(
      (await controller.execute({ operation: "capture", sourceId }, new AbortController().signal))
        .isError,
    ).toBe(true);
    expect(provider.capture).toHaveBeenCalledOnce();
  });
  it.each(["expire", "relist", "cancel"])("rejects obsolete sources after %s", async (reason) => {
    const { controller, provider, abort, list, advance } = setup();
    const sourceId = (await list())[0]?.sourceId;
    if (reason === "expire") advance();
    if (reason === "relist") await list();
    if (reason === "cancel") controller.cancel();
    expect(
      (await controller.execute({ operation: "capture", sourceId }, abort.signal)).isError,
    ).toBe(true);
    expect(
      (await controller.execute({ operation: "capture", sourceId: randomUUID() }, abort.signal))
        .isError,
    ).toBe(true);
    expect(provider.capture).not.toHaveBeenCalled();
  });
  it("bounds invalid operations and screen text requests before touching providers", async () => {
    const { controller, provider, abort, list } = setup();
    for (const request of [
      { operation: "shell" },
      { operation: "list", extra: true },
      { operation: "observe", screenshot: "yes" },
      { operation: "capture", sourceId: "window:123:0" },
    ])
      expect((await controller.execute(request, abort.signal)).isError).toBe(true);
    expect(provider.list).not.toHaveBeenCalled();
    const screen = (await list())[1]?.sourceId;
    expect(
      (await controller.execute({ operation: "read", sourceId: screen }, abort.signal)).isError,
    ).toBe(true);
    expect(provider.read).not.toHaveBeenCalled();
  });
  it("keeps lock and sleep independent, and resumes without a sharing prompt", async () => {
    const { controller, provider, observe } = setup();
    controller.setBlocked("locked", true);
    controller.setBlocked("suspended", true);
    controller.setBlocked("suspended", false);
    expect((await observe()).isError).toBe(true);
    expect(provider.current).not.toHaveBeenCalled();
    controller.setBlocked("locked", false);
    expect((await observe()).content[1]?.type).toBe("image");
  });
  it.each(["cancel", "stop", "timeout", "lock"])(
    "suppresses late images after %s and holds the OS lock",
    async (reason) => {
      vi.useFakeTimers();
      const { controller, provider, abort, list } = setup();
      const sourceId = (await list())[0]?.sourceId;
      let complete: ((value: { data: string; width: number; height: number }) => void) | undefined;
      provider.capture.mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const pending = controller.execute({ operation: "capture", sourceId }, abort.signal);
      if (reason === "cancel") controller.cancel();
      if (reason === "stop") abort.abort();
      if (reason === "timeout") await vi.advanceTimersByTimeAsync(15_001);
      if (reason === "lock") controller.setBlocked("locked", true);
      const result = await pending;
      expect(result.isError).toBe(true);
      expect(result.content.every((part) => part.type === "text")).toBe(true);
      controller.setBlocked("locked", false);
      expect(
        (await controller.execute({ operation: "list" }, new AbortController().signal)).isError,
      ).toBe(true);
      complete?.({ data: "c2VjcmV0", width: 1, height: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(
        (await controller.execute({ operation: "list" }, new AbortController().signal)).isError,
      ).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("c2VjcmV0");
    },
  );
  it("rejects oversized images and marks inaccessible text as a tool error", async () => {
    const { provider, controller, abort, list } = setup();
    const sourceId = (await list())[0]?.sourceId;
    provider.capture.mockResolvedValue({ data: "x".repeat(8_000_001), width: 1, height: 1 });
    expect(
      (await controller.execute({ operation: "capture", sourceId }, abort.signal)).isError,
    ).toBe(true);
    provider.read.mockResolvedValue({
      title: "",
      app: "",
      text: "",
      selectedText: "",
      tabs: [],
      truncated: false,
      unavailableReason: "Unavailable",
    });
    expect((await controller.execute({ operation: "read", sourceId }, abort.signal)).isError).toBe(
      true,
    );
  });
});
