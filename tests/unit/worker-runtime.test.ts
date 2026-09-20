import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const fork = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ utilityProcess: { fork } }));

import type { RuntimeConfig } from "../../src/agent/config";
import type { WorkerRequest } from "../../src/agent/protocol";
import { WorkerRuntime } from "../../src/main/worker-runtime";
import type { DesktopExecutor, DesktopRequest, DesktopResult } from "../../src/shared/desktop";
import type { WebExecutor } from "../../src/shared/web";

const config: RuntimeConfig = {
  mode: "pi",
  provider: "openai-codex",
  model: "gpt-5.6-sol",
  apiKey: "test-access",
};
const resolveConfig = async () => ({ ...config });

class TestWorker extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn(() => true);
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

type DesktopReply = Extract<WorkerRequest, { type: "desktop-result" }>;
const desktopImage: DesktopResult = {
  content: [
    { type: "text", text: "Private fixture window" },
    { type: "image", data: "cHJpdmF0ZS1waXhlbHM=", mimeType: "image/png" },
  ],
};

// The host dispatches observations through a short promise chain without I/O here.
async function dispatchDesktop() {
  for (let tick = 0; tick < 8; tick++) await Promise.resolve();
}

function pendingObservation() {
  let resolve: (result: DesktopResult) => void = () => {};
  const promise = new Promise<DesktopResult>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function startDesktopRuntime(desktop?: DesktopExecutor) {
  const child = new TestWorker();
  fork.mockReturnValue(child);
  const runtime = new WorkerRuntime(
    "worker.js",
    "/test",
    resolveConfig,
    undefined,
    undefined,
    desktop,
  );
  const abort = new AbortController();
  const delta = vi.fn();
  const activity = vi.fn();
  const run = runtime.run("Look at my screen", abort.signal, delta, activity);
  await Promise.resolve();
  const request = child.postMessage.mock.calls[0]?.[0] as Extract<WorkerRequest, { type: "run" }>;
  const observe = (operation: DesktopRequest = { operation: "list" }, callId = randomUUID()) => {
    child.emit("message", { type: "desktop-request", id: request.id, callId, request: operation });
    return callId;
  };
  const replies = () =>
    child.postMessage.mock.calls
      .map(([message]) => message as WorkerRequest)
      .filter((message): message is DesktopReply => message.type === "desktop-result");
  const done = async () => {
    child.emit("message", { type: "done", id: request.id });
    await run;
    runtime.dispose();
  };
  return { child, runtime, abort, delta, activity, run, request, observe, replies, done };
}

describe("private desktop worker requests", () => {
  it("routes web calls independently, rejects duplicates and suppresses late results", async () => {
    const child = new TestWorker();
    fork.mockReturnValue(child);
    let complete: (result: unknown) => void = () => {};
    const web = vi.fn<WebExecutor>().mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve as (result: unknown) => void;
        }),
    );
    const runtime = new WorkerRuntime(
      "worker.js",
      "/test",
      resolveConfig,
      undefined,
      undefined,
      undefined,
      web,
    );
    const abort = new AbortController();
    const delta = vi.fn();
    const activity = vi.fn();
    const running = runtime.run("Read a page", abort.signal, delta, activity);
    await Promise.resolve();
    const id = child.postMessage.mock.calls[0]?.[0].id;
    const request = {
      type: "web-request",
      id,
      callId: randomUUID(),
      request: { operation: "read", url: "https://example.com" },
    };
    child.emit("message", request);
    child.emit("message", request);
    await dispatchDesktop();
    expect(web).toHaveBeenCalledOnce();
    abort.abort();
    complete({ content: [{ type: "text", text: "private page" }] });
    await dispatchDesktop();
    expect(child.postMessage.mock.calls.some(([message]) => message.type === "web-result")).toBe(
      false,
    );
    expect(delta).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
    child.emit("message", { type: "done", id });
    await running;
    runtime.dispose();
  });
  it("returns image blocks privately and never forwards observation content to renderer callbacks", async () => {
    const desktop = vi.fn<DesktopExecutor>().mockResolvedValue(desktopImage);
    const test = await startDesktopRuntime(desktop);
    const sourceId = randomUUID();
    const callId = test.observe({ operation: "capture", sourceId });
    await dispatchDesktop();
    expect(desktop).toHaveBeenCalledWith(
      { operation: "capture", sourceId },
      expect.any(AbortSignal),
    );
    expect(test.replies()).toEqual([
      { type: "desktop-result", id: test.request.id, callId, result: desktopImage },
    ]);
    expect(test.delta).not.toHaveBeenCalled();
    expect(test.activity).not.toHaveBeenCalled();
    await test.done();
  });

  it("ignores malformed operations, extra keys, invalid native IDs and another turn's calls", async () => {
    const desktop = vi.fn<DesktopExecutor>().mockResolvedValue(desktopImage);
    const test = await startDesktopRuntime(desktop);
    for (const request of [
      { operation: "shell", command: "whoami" },
      { operation: "list", surprise: true },
      { operation: "capture", sourceId: "window:123:0" },
    ])
      test.child.emit("message", {
        type: "desktop-request",
        id: test.request.id,
        callId: randomUUID(),
        request,
      });
    test.child.emit("message", {
      type: "desktop-request",
      id: randomUUID(),
      callId: randomUUID(),
      request: { operation: "list" },
    });
    await dispatchDesktop();
    expect(desktop).not.toHaveBeenCalled();
    expect(test.replies()).toEqual([]);
    await test.done();
  });

  it.each(["done", "error", "abort", "dispose", "exit"])(
    "cancels pending observations and drops late results after %s",
    async (action) => {
      const pending = pendingObservation();
      const desktop = vi.fn<DesktopExecutor>().mockReturnValue(pending.promise);
      const test = await startDesktopRuntime(desktop);
      const settled = test.run.catch((error: Error) => error.message);
      test.observe();
      await dispatchDesktop();
      const signal = desktop.mock.calls[0]?.[1];
      expect(signal?.aborted).toBe(false);
      if (action === "done") test.child.emit("message", { type: "done", id: test.request.id });
      if (action === "error")
        test.child.emit("message", {
          type: "error",
          id: test.request.id,
          message: "Provider unavailable.",
        });
      if (action === "abort") {
        test.abort.abort();
        expect(signal?.aborted).toBe(true);
        test.child.emit("message", { type: "done", id: test.request.id });
      }
      if (action === "dispose") test.runtime.dispose();
      if (action === "exit") test.child.emit("exit", 1);
      expect(signal?.aborted).toBe(true);
      pending.resolve(desktopImage);
      await dispatchDesktop();
      await settled;
      expect(test.replies()).toEqual([]);
      expect(test.child.listenerCount("message")).toBe(0);
      test.runtime.dispose();
    },
  );

  it("never starts a queued observation when the turn finishes synchronously", async () => {
    const desktop = vi.fn<DesktopExecutor>().mockResolvedValue(desktopImage);
    const test = await startDesktopRuntime(desktop);
    test.observe();
    test.child.emit("message", { type: "done", id: test.request.id });
    await test.run;
    await dispatchDesktop();
    expect(desktop).not.toHaveBeenCalled();
    expect(test.replies()).toEqual([]);
    test.runtime.dispose();
  });

  it("ignores duplicate IDs, rejects overlapping requests and accepts the next sequential call", async () => {
    const pending = pendingObservation();
    const desktop = vi
      .fn<DesktopExecutor>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(desktopImage);
    const test = await startDesktopRuntime(desktop);
    const first = test.observe();
    test.observe({ operation: "list" }, first);
    const overlapping = test.observe();
    await dispatchDesktop();
    expect(desktop).toHaveBeenCalledOnce();
    expect(test.replies()).toHaveLength(1);
    expect(test.replies()[0]).toMatchObject({ callId: overlapping, result: { isError: true } });
    pending.resolve(desktopImage);
    await dispatchDesktop();
    test.observe({ operation: "list" }, first);
    const next = test.observe();
    await dispatchDesktop();
    expect(desktop).toHaveBeenCalledTimes(2);
    expect(test.replies().map((reply) => reply.callId)).toEqual([overlapping, first, next]);
    await test.done();
  });

  it("limits actual observations to twenty unique calls per turn", async () => {
    const desktop = vi.fn<DesktopExecutor>().mockResolvedValue(desktopImage);
    const test = await startDesktopRuntime(desktop);
    for (let index = 0; index < 21; index++) {
      test.observe();
      await dispatchDesktop();
    }
    expect(desktop).toHaveBeenCalledTimes(20);
    expect(test.replies()).toHaveLength(21);
    expect(test.replies().at(-1)?.result).toMatchObject({ isError: true });
    expect(JSON.stringify(test.replies().at(-1))).toContain("limit reached");
    await test.done();
  });

  it("sanitizes executor exceptions and rejects malformed results before worker delivery", async () => {
    const desktop = vi
      .fn<DesktopExecutor>()
      .mockRejectedValueOnce(new Error("private file and token"))
      .mockResolvedValueOnce({
        content: [{ type: "image", mimeType: "image/png", data: "not@base64" }],
      });
    const test = await startDesktopRuntime(desktop);
    test.observe();
    await dispatchDesktop();
    test.observe();
    await dispatchDesktop();
    expect(test.replies().map((reply) => reply.result.isError)).toEqual([true, true]);
    expect(JSON.stringify(test.replies())).not.toContain("private file");
    expect(JSON.stringify(test.replies())).not.toContain("not@base64");
    await test.done();
  });

  it("responds safely when no desktop executor is configured", async () => {
    const test = await startDesktopRuntime();
    test.observe();
    await dispatchDesktop();
    expect(test.replies()[0]?.result.isError).toBe(true);
    expect(JSON.stringify(test.replies()[0])).toContain("unavailable");
    await test.done();
  });

  it("cannot send a previous turn's late image into a new turn on the same worker", async () => {
    const pending = pendingObservation();
    const desktop = vi
      .fn<DesktopExecutor>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(desktopImage);
    const test = await startDesktopRuntime(desktop);
    test.observe();
    await dispatchDesktop();
    test.child.emit("message", { type: "done", id: test.request.id });
    await test.run;
    const next = test.runtime.run("Again", new AbortController().signal, test.delta);
    await Promise.resolve();
    const nextRequest = test.child.postMessage.mock.calls.at(-1)?.[0] as Extract<
      WorkerRequest,
      { type: "run" }
    >;
    pending.resolve(desktopImage);
    await dispatchDesktop();
    expect(test.replies()).toEqual([]);
    test.child.emit("message", {
      type: "desktop-request",
      id: nextRequest.id,
      callId: randomUUID(),
      request: { operation: "list" },
    });
    await dispatchDesktop();
    expect(test.replies()).toHaveLength(1);
    expect(test.replies()[0]?.id).toBe(nextRequest.id);
    test.child.emit("message", { type: "done", id: nextRequest.id });
    await next;
    test.runtime.dispose();
  });

  it.each(["run", "stop", "desktop-result"])(
    "settles safely when posting %s to a disconnected worker throws",
    async (type) => {
      const child = new TestWorker();
      fork.mockReturnValue(child);
      child.postMessage.mockImplementation((message: WorkerRequest) => {
        if (message.type === type) throw new Error("private IPC error");
      });
      const runtime = new WorkerRuntime(
        "worker.js",
        "/test",
        resolveConfig,
        undefined,
        undefined,
        async () => desktopImage,
      );
      const abort = new AbortController();
      const run = runtime.run("hi", abort.signal, () => {});
      const failure = expect(run).rejects.toThrow("disconnected");
      await Promise.resolve();
      const request = child.postMessage.mock.calls[0]?.[0] as Extract<
        WorkerRequest,
        { type: "run" }
      >;
      if (type === "stop") abort.abort();
      if (type === "desktop-result")
        child.emit("message", {
          type: "desktop-request",
          id: request.id,
          callId: randomUUID(),
          request: { operation: "list" },
        });
      await dispatchDesktop();
      await failure;
      expect(child.kill).toHaveBeenCalledOnce();
      expect(child.listenerCount("message")).toBe(0);
      await expect(runtime.run("retry", new AbortController().signal, () => {})).rejects.toThrow(
        "Start a new chat",
      );
      runtime.dispose();
    },
  );
});

describe("worker lifecycle", () => {
  it("rejects malformed configuration before spawning or transmitting to a worker", async () => {
    const runtime = new WorkerRuntime("worker.js", "/test", async () => ({
      ...config,
      model: "x".repeat(121),
    }));
    await expect(runtime.run("hi", new AbortController().signal, () => {})).rejects.toThrow(
      "invalid",
    );
    expect(fork).not.toHaveBeenCalled();
  });

  it("allows longer Codex reasoning while retaining a bounded reply timeout", async () => {
    vi.useFakeTimers();
    const child = new TestWorker();
    fork.mockReturnValue(child);
    const runtime = new WorkerRuntime("worker.js", "/test", resolveConfig);
    const run = runtime.run("hi", new AbortController().signal, () => {});
    const settled = expect(run).rejects.toThrow("took too long");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(120_001);
    expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(480_000);
    await settled;
    expect(child.kill).toHaveBeenCalledOnce();
    runtime.dispose();
  });
  it("detects a crash between turns and asks for a fresh conversation", async () => {
    const child = new TestWorker();
    fork.mockReturnValue(child);
    const runtime = new WorkerRuntime("worker.js", "/test", resolveConfig);
    const run = runtime.run("hi", new AbortController().signal, () => {});
    await Promise.resolve();
    const request = child.postMessage.mock.calls[0]?.[0] as { id: string };
    child.emit("message", { type: "done", id: request.id });
    await run;
    child.emit("exit", 1);
    await expect(runtime.run("again", new AbortController().signal, () => {})).rejects.toThrow(
      "Start a new chat",
    );
    runtime.dispose();
  });

  it("terminates a worker that ignores cancellation and settles the request", async () => {
    vi.useFakeTimers();
    const child = new TestWorker();
    fork.mockReturnValue(child);
    const runtime = new WorkerRuntime("worker.js", "/test", resolveConfig);
    const abort = new AbortController();
    const run = runtime.run("hi", abort.signal, () => {});
    await Promise.resolve();
    abort.abort();
    await vi.advanceTimersByTimeAsync(2001);
    await run;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.listenerCount("message")).toBe(0);
    runtime.dispose();
  });

  it("passes current credentials privately on each turn and ignores stale worker events", async () => {
    const child = new TestWorker();
    fork.mockReturnValue(child);
    const resolve = vi
      .fn()
      .mockResolvedValueOnce(config)
      .mockResolvedValueOnce({ ...config, apiKey: "rotated-access" });
    const runtime = new WorkerRuntime("worker.js", "/test", resolve);
    const delta = vi.fn();
    const first = runtime.run("first", new AbortController().signal, delta);
    await Promise.resolve();
    const request = child.postMessage.mock.calls[0]?.[0] as { id: string; config: RuntimeConfig };
    expect(request.config.apiKey).toBe("test-access");
    expect(fork.mock.calls[0]?.[2].env.COMPUTERCAT_API_KEY).toBeUndefined();
    child.emit("message", { type: "done", id: request.id });
    await first;
    const second = runtime.run("next", new AbortController().signal, delta);
    await Promise.resolve();
    const next = child.postMessage.mock.calls[1]?.[0] as { id: string; config: RuntimeConfig };
    expect(next.config.apiKey).toBe("rotated-access");
    child.emit("message", { type: "delta", id: request.id, text: "stale" });
    child.emit("message", { type: "done", id: next.id });
    await second;
    expect(delta).not.toHaveBeenCalled();
    expect(fork).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("does not start a worker if cancelled or disposed during credential refresh", async () => {
    for (const action of ["stop", "dispose"]) {
      let complete: ((value: RuntimeConfig) => void) | undefined;
      const runtime = new WorkerRuntime(
        "worker.js",
        "/test",
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const abort = new AbortController();
      const run = runtime.run("hi", abort.signal, () => {});
      const result = expect(run).rejects.toThrow();
      if (action === "stop") abort.abort();
      else runtime.dispose();
      complete?.(config);
      await result;
      runtime.dispose();
    }
    expect(fork).not.toHaveBeenCalled();
  });
});
