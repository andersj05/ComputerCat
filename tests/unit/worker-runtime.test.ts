import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const fork = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ utilityProcess: { fork } }));

import { WorkerRuntime } from "../../src/main/worker-runtime";

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
    const runtime = new WorkerRuntime("worker.js", "/test");
    const run = runtime.run("hi", new AbortController().signal, () => {});
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
    const runtime = new WorkerRuntime("worker.js", "/test");
    const abort = new AbortController();
    const run = runtime.run("hi", abort.signal, () => {});
    abort.abort();
    await vi.advanceTimersByTimeAsync(2001);
    await run;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.listenerCount("message")).toBe(0);
    runtime.dispose();
  });
});
