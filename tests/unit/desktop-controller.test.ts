import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopController, type DesktopProvider } from "../../src/main/desktop/controller";

function setup() {
  let now = 1_000_000;
  const provider = {
    list: vi.fn<DesktopProvider["list"]>().mockResolvedValue([
      { id: "window:123:0", name: "Fixture", kind: "window" },
      { id: "screen:0:0", name: "Display", kind: "screen" },
    ]),
    capture: vi
      .fn<DesktopProvider["capture"]>()
      .mockResolvedValue({ data: "cG5n", width: 640, height: 480 }),
    read: vi.fn<DesktopProvider["read"]>().mockResolvedValue({
      title: "Fixture",
      app: "Test",
      text: "Readable text",
      selectedText: "selection",
      tabs: ["Tab one"],
      truncated: false,
    }),
  };
  const publish = vi.fn();
  const controller = new DesktopController(provider, publish, () => now);
  const abort = new AbortController();
  const list = async () => {
    const result = await controller.execute({ operation: "list" }, abort.signal);
    const text = result.content[0];
    if (text?.type !== "text") throw new Error("Expected sources");
    return JSON.parse(text.text).sources as { sourceId: string; title: string }[];
  };
  return {
    provider,
    publish,
    controller,
    abort,
    list,
    advance: () => {
      now += 60_001;
    },
  };
}

afterEach(() => vi.useRealTimers());
describe("desktop permission broker", () => {
  it("defaults off and enabling never inspects the desktop", async () => {
    const { controller, provider, abort } = setup();
    expect(controller.snapshot()).toEqual({ enabled: false, busy: false });
    expect((await controller.execute({ operation: "list" }, abort.signal)).isError).toBe(true);
    expect(controller.setEnabled({ enabled: true }).enabled).toBe(true);
    expect(provider.list).not.toHaveBeenCalled();
    expect(provider.capture).not.toHaveBeenCalled();
  });

  it("rejects invalid grants and requests without widening access", async () => {
    const { controller, provider, abort } = setup();
    expect(controller.setEnabled({ enabled: "true" }).error).toBeDefined();
    expect(controller.setEnabled({ enabled: true, extra: true }).enabled).toBe(false);
    controller.setEnabled({ enabled: true });
    for (const request of [
      { operation: "shell" },
      { operation: "list", extra: true },
      { operation: "capture", sourceId: "window:123:0" },
    ]) {
      expect((await controller.execute(request, abort.signal)).isError).toBe(true);
    }
    expect(provider.list).not.toHaveBeenCalled();
  });

  it("issues opaque sources and forwards a bounded image plus observation metadata", async () => {
    const { controller, provider, abort, list } = setup();
    controller.setEnabled({ enabled: true });
    const sources = await list();
    expect(sources[0]?.sourceId).not.toContain("123");
    const result = await controller.execute(
      { operation: "capture", sourceId: sources[0]?.sourceId },
      abort.signal,
    );
    expect(result.content[1]).toEqual({ type: "image", data: "cG5n", mimeType: "image/png" });
    expect(JSON.stringify(result.content[0])).toContain("observedAt");
    expect(provider.capture.mock.calls[0]?.[0].id).toBe("window:123:0");
  });

  it("returns readable tabs/selection but rejects reading a screen", async () => {
    const { controller, provider, abort, list } = setup();
    controller.setEnabled({ enabled: true });
    const sources = await list();
    const result = await controller.execute(
      { operation: "read", sourceId: sources[0]?.sourceId },
      abort.signal,
    );
    expect(JSON.stringify(result)).toContain("selection");
    expect(JSON.stringify(result)).toContain("Tab one");
    expect(
      (
        await controller.execute(
          { operation: "read", sourceId: sources[1]?.sourceId },
          abort.signal,
        )
      ).isError,
    ).toBe(true);
    expect(provider.read).toHaveBeenCalledOnce();
  });

  it.each(["expire", "relist", "revoke"])("rejects obsolete sources after %s", async (reason) => {
    const { controller, provider, abort, list, advance } = setup();
    controller.setEnabled({ enabled: true });
    const sources = await list();
    if (reason === "expire") advance();
    if (reason === "relist") await list();
    if (reason === "revoke") {
      controller.revoke();
      controller.setEnabled({ enabled: true });
    }
    expect(
      (
        await controller.execute(
          { operation: "capture", sourceId: sources[0]?.sourceId },
          abort.signal,
        )
      ).isError,
    ).toBe(true);
    expect(
      (await controller.execute({ operation: "capture", sourceId: randomUUID() }, abort.signal))
        .isError,
    ).toBe(true);
    expect(provider.capture).not.toHaveBeenCalled();
  });

  it.each(["revoke", "stop", "timeout"])(
    "discards late observations after %s and holds the OS operation lock",
    async (reason) => {
      vi.useFakeTimers();
      const { controller, provider, abort, list } = setup();
      controller.setEnabled({ enabled: true });
      const sources = await list();
      let complete: ((value: { data: string; width: number; height: number }) => void) | undefined;
      provider.capture.mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const running = controller.execute(
        { operation: "capture", sourceId: sources[0]?.sourceId },
        abort.signal,
      );
      expect(controller.snapshot().busy).toBe(true);
      if (reason === "revoke") controller.revoke();
      if (reason === "stop") abort.abort();
      if (reason === "timeout") await vi.advanceTimersByTimeAsync(15_001);
      const result = await running;
      expect(result.isError).toBe(true);
      expect(result.content.every((part) => part.type === "text")).toBe(true);
      controller.setEnabled({ enabled: true });
      expect(
        (await controller.execute({ operation: "list" }, new AbortController().signal)).isError,
      ).toBe(true);
      complete?.({ data: "c2VjcmV0", width: 1, height: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.snapshot().busy).toBe(false);
      expect(JSON.stringify(result)).not.toContain("c2VjcmV0");
    },
  );

  it("sanitizes provider failures and oversized observations", async () => {
    const { controller, provider, abort, list } = setup();
    controller.setEnabled({ enabled: true });
    const sources = await list();
    provider.capture.mockRejectedValueOnce(new Error("private path or token"));
    const failed = await controller.execute(
      { operation: "capture", sourceId: sources[0]?.sourceId },
      abort.signal,
    );
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toContain("private");
    provider.capture.mockResolvedValueOnce({ data: "x".repeat(8_000_001), width: 1, height: 1 });
    expect(
      (
        await controller.execute(
          { operation: "capture", sourceId: sources[0]?.sourceId },
          abort.signal,
        )
      ).isError,
    ).toBe(true);
  });

  it("does not publish results from a stale listing after a new grant", async () => {
    const { controller, provider, abort } = setup();
    controller.setEnabled({ enabled: true });
    let finish: ((sources: []) => void) | undefined;
    provider.list.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = controller.execute({ operation: "list" }, abort.signal);
    controller.revoke();
    controller.setEnabled({ enabled: true });
    finish?.([]);
    expect((await pending).isError).toBe(true);
  });

  it("never leaks observation contents through state events", async () => {
    const { controller, publish, abort, list } = setup();
    controller.setEnabled({ enabled: true });
    const sources = await list();
    await controller.execute({ operation: "read", sourceId: sources[0]?.sourceId }, abort.signal);
    const events = JSON.stringify(publish.mock.calls);
    expect(events).not.toContain("Readable text");
    expect(events).not.toContain("Fixture");
  });

  it("reports unsupported accessibility as a tool error with its limitation", async () => {
    const { controller, provider, abort, list } = setup();
    controller.setEnabled({ enabled: true });
    const sources = await list();
    provider.read.mockResolvedValue({
      title: "",
      app: "",
      text: "",
      selectedText: "",
      tabs: [],
      truncated: false,
      unavailableReason: "This window does not expose readable text.",
    });
    const result = await controller.execute(
      { operation: "read", sourceId: sources[0]?.sourceId },
      abort.signal,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("does not expose readable text");
  });
});
