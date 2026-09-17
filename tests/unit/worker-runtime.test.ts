import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const fork = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ utilityProcess: { fork } }));

import type { RuntimeConfig } from "../../src/agent/config";
import { WorkerRuntime } from "../../src/main/worker-runtime";

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

describe("worker lifecycle", () => {
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
