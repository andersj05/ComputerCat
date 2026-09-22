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
    current: vi.fn<DesktopProvider["current"]>(async () => ({
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
    })),
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
    provider,
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

  it("searches before native result limits and resolves only window identity first", async () => {
    const { controller, input, provider, turn, act, inspect } = setup();
    const old = await inspect();
    const result = data(
      await controller.execute({ operation: "inspect", query: " Reply " }, turn.signal),
    );
    expect(provider.current).toHaveBeenLastCalledWith(expect.any(AbortSignal), "identity");
    expect(input.inspect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "window:123:0" }),
      expect.any(AbortSignal),
      "Reply",
    );
    expect(result.observationId).not.toBe(old.observationId);
    expect((await act(old.observationId)).isError).toBe(true);
    expect(input.act).not.toHaveBeenCalled();
  });

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

  it.each(["disabled", "unadvertised", "missing element"])(
    "rejects %s targets without dispatch and consumes the observation",
    async (cause) => {
      const { inspect, act, input } = setup();
      input.inspect.mockResolvedValue({
        ...snapshot,
        elements:
          cause === "missing element"
            ? []
            : [
                {
                  ...editor,
                  enabled: cause !== "disabled",
                  actions: cause === "unadvertised" ? ["key"] : ["fill"],
                },
              ],
      });
      const before = await inspect();
      expect((await act(before.observationId)).isError).toBe(true);
      expect((await act(before.observationId)).isError).toBe(true);
      expect(input.act).not.toHaveBeenCalled();
    },
  );

  it.each(["throw", "malformed", "no snapshot"])(
    "consumes references after %s outcomes and recovers through fresh inspection",
    async (cause) => {
      const { inspect, act, input } = setup();
      const before = await inspect();
      if (cause === "throw")
        input.act.mockRejectedValueOnce(new Error("private provider diagnostics"));
      if (cause === "malformed")
        input.act.mockResolvedValueOnce({
          status: "dispatched",
          reason: "ok",
          snapshot: {},
        } as never);
      if (cause === "no snapshot")
        input.act.mockResolvedValueOnce({ status: "uncertain", reason: "failed" });
      const result = await act(before.observationId);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("private provider diagnostics");
      expect((await act(before.observationId)).isError).toBe(true);
      expect(input.act).toHaveBeenCalledOnce();
      const fresh = await inspect();
      expect((await act(fresh.observationId)).isError).not.toBe(true);
      expect(input.act).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["windowHandle", "processId", "processStarted"] as const)(
    "does not publish replacement %s identities",
    async (field) => {
      const { inspect, act, input } = setup();
      input.act.mockResolvedValueOnce({
        status: "dispatched",
        reason: "ok",
        snapshot: { ...snapshot, [field]: field === "processId" ? 999 : "999" },
      });
      const before = await inspect();
      const after = data(await act(before.observationId));
      expect(after.observation).toBeUndefined();
      expect(after.next).toContain("desktop_inspect");
      expect((await act(before.observationId)).isError).toBe(true);
      expect(input.act).toHaveBeenCalledOnce();
    },
  );

  it.each(["cancel", "locked", "suspended", "deadline"] as const)(
    "holds input ownership and suppresses late evidence after %s",
    async (cause) => {
      vi.useFakeTimers();
      try {
        const { inspect, act, controller, input, turn } = setup();
        const before = await inspect();
        let finish!: (value: Awaited<ReturnType<ComputerInput["act"]>>) => void;
        input.act.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        );
        const pending = act(before.observationId);
        expect(input.act).toHaveBeenCalledOnce();
        const nativeSignal = input.act.mock.calls[0]?.[3];
        if (cause === "cancel") controller.cancel();
        else if (cause === "deadline") await vi.advanceTimersByTimeAsync(15_001);
        else controller.setBlocked(cause, true);
        expect(nativeSignal?.aborted).toBe(true);
        expect((await pending).isError).toBe(true);
        if (cause === "locked" || cause === "suspended") controller.setBlocked(cause, false);
        expect((await controller.execute({ operation: "inspect" }, turn.signal)).isError).toBe(
          true,
        );
        expect(input.inspect).toHaveBeenCalledOnce();
        finish({ status: "dispatched", reason: "ok", snapshot });
        await vi.advanceTimersByTimeAsync(0);
        expect((await act(before.observationId)).isError).toBe(true);
        const fresh = await inspect();
        expect(fresh.observationId).not.toBe(before.observationId);
        expect((await act(fresh.observationId)).isError).not.toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
  );

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
    ...["\ud800", "\udc00", "\u0000", "\u001b"].map((text) => ({
      operation: "act",
      observationId: randomUUID(),
      action: { kind: "type", elementId: "e1", text },
    })),
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
    { operation: "inspect", query: " " },
    { operation: "inspect", query: "x".repeat(121) },
  ])("rejects forged or unbounded requests", (request) => {
    expect(desktopRequestSchema.safeParse(request).success).toBe(false);
  });

  it("accepts literal multilingual, multiline drafts at the input boundary", () => {
    expect(
      desktopRequestSchema.safeParse({
        operation: "act",
        observationId: randomUUID(),
        action: { kind: "fill", elementId: "e1", text: "Hi Robin,\nCafé 🐈\t金曜日" },
      }).success,
    ).toBe(true);
  });
});
