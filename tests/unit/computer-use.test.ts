import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ComputerInput } from "../../src/main/desktop/computer-use";
import { DesktopController, type DesktopProvider } from "../../src/main/desktop/controller";
import type { ComputerSnapshot } from "../../src/shared/computer-use";
import {
  type DesktopResult,
  desktopRequestSchema,
  desktopResultSchema,
} from "../../src/shared/desktop";

const snapshot: ComputerSnapshot = {
  windowHandle: "123",
  processId: 42,
  processStarted: "1234567",
  foreground: "123",
  lastInput: 1,
  title: "Draft fixture",
  app: "Fixture",
  bounds: { x: -100, y: 0, width: 800, height: 600 },
  text: "Recipient: robin@example.com",
  truncated: false,
  elements: [
    {
      runtimeId: [42, 1],
      name: "Message",
      role: "Edit",
      enabled: true,
      bounds: { x: 0, y: 0, width: 400, height: 200 },
      signature: "a".repeat(64),
      actions: ["fill", "type", "key"],
      value: "",
    },
  ],
};
const editor = snapshot.elements[0];
if (!editor) throw new Error("Missing fixture editor");
function data(result: DesktopResult) {
  const block = result.content[0];
  if (block?.type !== "text") throw new Error("Missing text");
  return JSON.parse(block.text);
}
function setup() {
  let now = 1000;
  const input = {
    inspect: vi.fn<ComputerInput["inspect"]>().mockResolvedValue(structuredClone(snapshot)),
    act: vi.fn<ComputerInput["act"]>().mockResolvedValue({
      status: "dispatched",
      reason: "ok",
      snapshot: structuredClone(snapshot),
    }),
  };
  const source = { id: "window:123:0", name: snapshot.title, kind: "window" as const };
  const provider: DesktopProvider = {
    input,
    list: async () => [source],
    capture: vi.fn(),
    read: vi.fn(),
    current: async () => ({
      source,
      target: "behind-assistant",
      text: {
        title: source.name,
        app: "Fixture",
        text: "",
        selectedText: "",
        tabs: [],
        truncated: false,
      },
    }),
  };
  const controller = new DesktopController(provider, () => now);
  const turn = new AbortController();
  const inspect = async () => data(await controller.execute({ operation: "inspect" }, turn.signal));
  const act = (observationId: string, signal = turn.signal) =>
    controller.execute(
      {
        operation: "act",
        observationId,
        action: { kind: "fill", elementId: "e1", text: "Hello Robin" },
      },
      signal,
    );
  return {
    controller,
    input,
    turn,
    inspect,
    act,
    advance: () => {
      now += 60_001;
    },
  };
}

describe("computer-use boundary", () => {
  it("issues opaque control handles and returns fresh post-action evidence", async () => {
    const { inspect, act, input } = setup();
    const before = await inspect();
    expect(before.elements[0]).toMatchObject({
      elementId: "e1",
      name: "Message",
      actions: ["fill", "type", "key"],
    });
    expect(JSON.stringify(before)).not.toMatch(
      /runtimeId|processId|windowHandle|processStarted|signature|foreground|lastInput/,
    );
    const after = data(await act(before.observationId));
    expect(after.status).toBe("dispatched");
    expect(after.observation.observationId).not.toBe(before.observationId);
    expect(input.act).toHaveBeenCalledWith(
      snapshot,
      snapshot.elements[0],
      { kind: "fill", elementId: "e1", text: "Hello Robin" },
      expect.any(AbortSignal),
    );
    expect((await act(before.observationId)).isError).toBe(true);
    expect(input.act).toHaveBeenCalledOnce();
  });

  it.each(["age", "turn", "inspect", "list", "cancel", "lock"])(
    "rejects targets invalidated by %s before native dispatch",
    async (cause) => {
      const { inspect, act, controller, input, advance, turn } = setup();
      const before = await inspect();
      if (cause === "age") advance();
      if (cause === "inspect") await inspect();
      if (cause === "list") await controller.execute({ operation: "list" }, turn.signal);
      if (cause === "cancel") controller.cancel();
      if (cause === "lock") controller.setBlocked("locked", true);
      const result = await act(
        before.observationId,
        cause === "turn" ? new AbortController().signal : turn.signal,
      );
      expect(result.isError).toBe(true);
      expect(input.act).not.toHaveBeenCalled();
    },
  );

  it("does not expose post-action targets from a replacement process", async () => {
    const { inspect, act, input } = setup();
    input.act.mockResolvedValue({
      status: "uncertain",
      reason: "failed",
      snapshot: { ...snapshot, processStarted: "987" },
    });
    const result = await act((await inspect()).observationId);
    expect(result.isError).toBe(true);
    expect(data(result).observation).toBeUndefined();
    expect(data(result).warning).toContain("may already");
  });

  it("retains the serialization lock until a cancelled native action exits", async () => {
    const { inspect, act, controller, input, turn } = setup();
    let finish!: (value: { status: "dispatched"; reason: "ok" }) => void;
    input.act.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = act((await inspect()).observationId);
    await vi.waitFor(() => expect(input.act).toHaveBeenCalled());
    turn.abort();
    expect((await pending).isError).toBe(true);
    expect(
      await controller.execute({ operation: "inspect" }, new AbortController().signal),
    ).toMatchObject({ isError: true });
    expect(input.inspect).toHaveBeenCalledOnce();
    finish({ status: "dispatched", reason: "ok" });
    await vi.waitFor(async () =>
      expect(
        (await controller.execute({ operation: "inspect" }, new AbortController().signal)).isError,
      ).not.toBe(true),
    );
  });

  it("rejects disabled or unadvertised actions and invalid element IDs", async () => {
    const { inspect, act, input } = setup();
    input.inspect.mockResolvedValue({
      ...snapshot,
      elements: [{ ...editor, actions: ["key"] }],
    });
    expect((await act((await inspect()).observationId)).isError).toBe(true);
    expect(input.act).not.toHaveBeenCalled();
  });

  it("bounds large screen results while preserving usable IDs", async () => {
    const { inspect, input } = setup();
    input.inspect.mockResolvedValue({
      ...snapshot,
      elements: Array.from({ length: 60 }, () => ({
        ...editor,
        name: '"'.repeat(512),
        value: '"'.repeat(8000),
      })),
    });
    const result = await inspect();
    expect(result.truncated).toBe(true);
    expect(
      desktopResultSchema.safeParse({ content: [{ type: "text", text: JSON.stringify(result) }] })
        .success,
    ).toBe(true);
  });

  it.each([
    {
      operation: "act",
      observationId: randomUUID(),
      action: { kind: "fill", elementId: "e1", text: "x", hwnd: "123" },
    },
    {
      operation: "act",
      observationId: randomUUID(),
      action: { kind: "key", elementId: "e1", key: "Control+Enter" },
    },
    {
      operation: "act",
      observationId: randomUUID(),
      action: { kind: "fill", elementId: "e1", text: "x".repeat(8001) },
    },
    { operation: "act", observationId: randomUUID(), action: { kind: "click", elementId: "e0" } },
    { operation: "inspect", sourceId: "window:123:0" },
  ])("rejects forged or unbounded requests", (request) => {
    expect(desktopRequestSchema.safeParse(request).success).toBe(false);
  });
});
