import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopWorkerClient } from "../../src/agent/desktop-rpc";
import { createDesktopTools } from "../../src/agent/desktop-tools";
import { type WorkerEvent, workerEventSchema, workerRequestSchema } from "../../src/agent/protocol";
import type { DesktopResult } from "../../src/shared/desktop";

const turnId = "c023829d-1a03-4355-887d-715527c28c29";
const sourceId = "db0e0ba2-8704-4d6a-a0d2-f0f947c44d7c";
const otherId = "00ff0f99-e58d-4b47-b87e-7d969f67c596";
const textResult: DesktopResult = { content: [{ type: "text", text: "Fixture window text." }] };
const imageResult: DesktopResult = {
  content: [
    { type: "text", text: "Fixture screenshot." },
    { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
  ],
};

function invoke(tool: ToolDefinition | undefined, args = {}, signal?: AbortSignal) {
  if (!tool) throw new Error("Missing test tool");
  return tool.execute("fixture-call", args, signal, undefined, {} as ExtensionContext);
}

afterEach(() => vi.useRealTimers());

describe("desktop tools", () => {
  it.each([
    ["desktop_read_selection", "selection"],
    ["desktop_list_tabs", "tabs"],
    ["desktop_read_page", "page"],
    ["desktop_list_controls", "controls"],
  ])("routes %s directly to a focused read without an image", async (name, operation) => {
    const execute = vi.fn().mockResolvedValue(textResult);
    const tool = createDesktopTools(execute, false).find((item) => item.name === name);
    await invoke(tool);
    expect(execute).toHaveBeenLastCalledWith({ operation }, expect.any(AbortSignal));
    await invoke(tool, { sourceId });
    expect(execute).toHaveBeenLastCalledWith({ operation, sourceId }, expect.any(AbortSignal));
  });

  it("validates region bounds and image support before capture", async () => {
    const execute = vi.fn().mockResolvedValue(imageResult);
    const tool = createDesktopTools(execute, true).find(
      (item) => item.name === "desktop_capture_region",
    );
    const region = { x: 0.5, y: 0, width: 0.5, height: 1 };
    await invoke(tool, { sourceId, ...region });
    expect(execute).toHaveBeenCalledWith(
      { operation: "capture-region", sourceId, region },
      expect.any(AbortSignal),
    );
    await expect(invoke(tool, { sourceId, ...region, width: 0.9 })).rejects.toThrow();
    const textOnly = createDesktopTools(execute, false).find(
      (item) => item.name === "desktop_capture_region",
    );
    await expect(invoke(textOnly, { sourceId, ...region })).rejects.toThrow(
      "cannot view screenshots",
    );
    expect(execute).toHaveBeenCalledOnce();
  });

  it("validates a literal app search before dispatch and returns no private details", async () => {
    const execute = vi.fn().mockResolvedValue(textResult);
    const tool = createDesktopTools(execute, false).find(
      (item) => item.name === "desktop_find_text",
    );
    const result = await invoke(tool, { sourceId, query: "  Error [42]  " });
    expect(execute).toHaveBeenCalledWith(
      { operation: "find-text", sourceId, query: "Error [42]" },
      expect.any(AbortSignal),
    );
    expect(result.details).toEqual({ operation: "find-text" });
    for (const query of ["   ", "x".repeat(201)])
      await expect(invoke(tool, { query })).rejects.toThrow();
    expect(execute).toHaveBeenCalledOnce();
  });
  it.each([
    [true, {}, { operation: "observe", screenshot: true }],
    [false, {}, { operation: "observe", screenshot: false }],
    [true, { includeScreenshot: false }, { operation: "observe", screenshot: false }],
    [true, { sourceId }, { operation: "observe", sourceId, screenshot: true }],
  ])(
    "observes current or named apps with image capability %s and options %j",
    async (supportsImages, args, request) => {
      const execute = vi.fn().mockResolvedValue(textResult);
      const tool = createDesktopTools(execute, supportsImages).find(
        (item) => item.name === "desktop_observe",
      );
      await invoke(tool, args);
      expect(execute).toHaveBeenCalledWith(request, expect.any(AbortSignal));
    },
  );

  it("preserves model image blocks without copying observations into result details", async () => {
    const execute = vi.fn().mockResolvedValue(imageResult);
    const tools = createDesktopTools(execute, true);
    const abort = new AbortController();
    const result = await invoke(tools[1], { sourceId }, abort.signal);
    expect(execute).toHaveBeenCalledWith({ operation: "capture", sourceId }, abort.signal);
    expect(result.content).toEqual(imageResult.content);
    expect(result.details).toEqual({ operation: "capture" });
  });

  it("refuses screenshots for text-only models before performing a capture", async () => {
    const execute = vi.fn().mockResolvedValue(textResult);
    const tools = createDesktopTools(execute, false);
    await expect(invoke(tools[1], { sourceId })).rejects.toThrow("cannot view screenshots");
    expect(execute).not.toHaveBeenCalled();
    await invoke(tools[2], { sourceId });
    expect(execute).toHaveBeenCalledWith({ operation: "read", sourceId }, expect.any(AbortSignal));
  });

  it("rejects invented native IDs and a cancelled call before any observation", async () => {
    const execute = vi.fn().mockResolvedValue(textResult);
    const tools = createDesktopTools(execute, true);
    await expect(invoke(tools[1], { sourceId: "window:123:0" })).rejects.toThrow("fresh");
    const abort = new AbortController();
    abort.abort();
    await expect(invoke(tools[0], {}, abort.signal)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects late observations after cancellation", async () => {
    const abort = new AbortController();
    const tools = createDesktopTools(async () => {
      abort.abort();
      return imageResult;
    }, true);
    await expect(invoke(tools[1], { sourceId }, abort.signal)).rejects.toThrow();
  });

  it("converts safe broker errors into Pi failures and sanitizes executor exceptions", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "The desktop is locked." }],
        isError: true,
      })
      .mockRejectedValueOnce(new Error("private-path-secret"))
      .mockResolvedValueOnce({
        content: [{ type: "image", data: "invalid@", mimeType: "image/png" }],
      });
    const tools = createDesktopTools(execute, true);
    await expect(invoke(tools[0])).rejects.toThrow("The desktop is locked.");
    await expect(invoke(tools[0])).rejects.toThrow("The desktop observation failed.");
    await expect(invoke(tools[0])).rejects.toThrow("invalid response");
  });
});

describe("desktop worker RPC", () => {
  function setup(timeoutMs = 1000) {
    const sent: WorkerEvent[] = [];
    const client = new DesktopWorkerClient((event) => sent.push(event), timeoutMs);
    const abort = new AbortController();
    client.beginTurn(turnId, abort.signal);
    const latest = () => {
      const event = sent.at(-1);
      if (event?.type !== "desktop-request") throw new Error("Missing desktop request");
      return event;
    };
    const reply = (result = textResult) => {
      const event = latest();
      return { type: "desktop-result" as const, id: event.id, callId: event.callId, result };
    };
    return { client, abort, sent, latest, reply };
  }

  it("correlates turn and call IDs, and ignores wrong or duplicate replies", async () => {
    const { client, abort, latest, reply } = setup();
    const result = client.execute({ operation: "capture", sourceId }, abort.signal);
    expect(workerEventSchema.safeParse(latest()).success).toBe(true);
    expect(client.receive({ ...reply(), id: otherId })).toBe(false);
    expect(client.receive({ ...reply(), callId: otherId })).toBe(false);
    expect(client.receive(reply(imageResult))).toBe(true);
    expect(client.receive(reply(imageResult))).toBe(false);
    await expect(result).resolves.toEqual(imageResult);
  });

  it.each(["tool", "turn", "end"] as const)(
    "cancels pending calls on %s cancellation",
    async (kind) => {
      const { client, abort, reply } = setup();
      const toolAbort = new AbortController();
      const result = client.execute({ operation: "list" }, toolAbort.signal);
      const failure = expect(result).rejects.toThrow("ended");
      if (kind === "tool") toolAbort.abort();
      else if (kind === "turn") abort.abort();
      else client.endTurn();
      await failure;
      expect(client.receive(reply())).toBe(false);
    },
  );

  it("expires a stalled host request and releases its pending slot", async () => {
    vi.useFakeTimers();
    const { client, abort, reply } = setup();
    const result = client.execute({ operation: "list" }, abort.signal);
    const failure = expect(result).rejects.toThrow("ended");
    const stale = reply();
    await vi.advanceTimersByTimeAsync(1000);
    await failure;
    expect(client.receive(stale)).toBe(false);
    const next = client.execute({ operation: "list" }, abort.signal);
    expect(client.receive(reply())).toBe(true);
    await expect(next).resolves.toEqual(textResult);
  });

  it("bounds pending calls and fails closed after a turn ends", async () => {
    const { client, abort } = setup();
    const pending = Array.from({ length: 4 }, () =>
      client.execute({ operation: "list" }, abort.signal).catch((error: Error) => error.message),
    );
    await expect(client.execute({ operation: "list" }, abort.signal)).rejects.toThrow("Too many");
    client.endTurn();
    expect(await Promise.all(pending)).toEqual(
      Array(4).fill(
        "The desktop request ended before a result arrived. An action may already have happened; inspect before retrying.",
      ),
    );
    await expect(client.execute({ operation: "list" }, abort.signal)).rejects.toThrow("no active");
  });

  it("does not deliver a previous turn's result to a replacement turn", async () => {
    const { client, abort, reply } = setup();
    const previous = client.execute({ operation: "list" }, abort.signal);
    const failure = expect(previous).rejects.toThrow("ended");
    const stale = reply();
    client.beginTurn(otherId, new AbortController().signal);
    await failure;
    const next = client.execute({ operation: "list" }, new AbortController().signal);
    expect(client.receive(stale)).toBe(false);
    client.receive(reply());
    await expect(next).resolves.toEqual(textResult);
  });

  it("cleans up a failed port send", async () => {
    const client = new DesktopWorkerClient(() => {
      throw new Error("port closed");
    });
    const abort = new AbortController();
    client.beginTurn(turnId, abort.signal);
    await expect(client.execute({ operation: "list" }, abort.signal)).rejects.toThrow("ended");
    client.endTurn();
  });

  it("validates private requests and replies, rejecting unknown payloads", () => {
    expect(
      workerEventSchema.safeParse({
        type: "desktop-request",
        id: turnId,
        callId: otherId,
        request: { operation: "capture", sourceId },
      }).success,
    ).toBe(true);
    expect(
      workerEventSchema.safeParse({
        type: "desktop-request",
        id: turnId,
        callId: otherId,
        request: { operation: "shell", command: "whoami" },
      }).success,
    ).toBe(false);
    expect(
      workerRequestSchema.safeParse({
        type: "desktop-result",
        id: turnId,
        callId: otherId,
        result: imageResult,
      }).success,
    ).toBe(true);
    expect(
      workerRequestSchema.safeParse({
        type: "desktop-result",
        id: turnId,
        callId: otherId,
        result: { ...imageResult, secret: "no" },
      }).success,
    ).toBe(false);
  });
});
