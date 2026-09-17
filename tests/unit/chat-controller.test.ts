import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntime } from "../../src/agent/runtime";
import { ChatController } from "../../src/main/chat-controller";

function harness(run: AgentRuntime["run"]) {
  const runtime = { run: vi.fn(run), dispose: vi.fn() };
  const changed = vi.fn();
  const controller = new ChatController(() => runtime, changed);
  return { runtime, changed, controller };
}

describe("chat boundary", () => {
  it("rejects invalid, oversized, and unexpected input before running tools", () => {
    const { controller, runtime } = harness(async () => {});
    for (const request of [
      null,
      { id: randomUUID(), text: " " },
      { id: randomUUID(), text: "x".repeat(6001) },
      { id: randomUUID(), text: "hi", tool: "shell" },
    ]) {
      expect(controller.send(request).ok).toBe(false);
    }
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it("streams replies, rejects concurrent sends, and protects its state", async () => {
    let finish: (() => void) | undefined;
    const { controller } = harness(async (_prompt, _signal, delta) => {
      delta("Hello ");
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      delta("cat");
    });
    expect(controller.send({ id: randomUUID(), text: "hi" }).ok).toBe(true);
    expect(controller.send({ id: randomUUID(), text: "overlap" }).ok).toBe(false);
    const snapshot = controller.snapshot();
    snapshot.messages.length = 0;
    expect(controller.snapshot().messages).toHaveLength(2);
    finish?.();
    await vi.waitFor(() => expect(controller.snapshot().busy).toBe(false));
    expect(controller.snapshot().messages[1]?.text).toBe("Hello cat");
  });

  it("stops output and ignores late deltas", async () => {
    const { controller } = harness(async (_prompt, signal, delta) => {
      delta("Start");
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      delta(" should never appear");
    });
    controller.send({ id: randomUUID(), text: "hi" });
    expect((await controller.clear()).ok).toBe(false);
    controller.stop();
    await vi.waitFor(() => expect(controller.snapshot().busy).toBe(false));
    expect(controller.snapshot().messages[1]).toMatchObject({ text: "Start", state: "stopped" });
    expect((await controller.clear()).ok).toBe(true);
    expect(controller.snapshot().messages).toHaveLength(0);
  });

  it("does not leak provider exception details into the UI", async () => {
    const { controller } = harness(async () => {
      throw new Error("secret credential in provider error");
    });
    controller.send({ id: randomUUID(), text: "hi" });
    await vi.waitFor(() => expect(controller.snapshot().busy).toBe(false));
    expect(controller.snapshot().messages[1]?.state).toBe("error");
    expect(JSON.stringify(controller.snapshot())).not.toContain("secret credential");
  });

  it("disposes disconnected workers and preserves the transcript until a new conversation", async () => {
    const { controller, runtime } = harness(async (_prompt, _signal, delta) => {
      delta("Old conversation");
    });
    controller.send({ id: randomUUID(), text: "hi" });
    await vi.waitFor(() => expect(controller.snapshot().busy).toBe(false));
    controller.invalidateConnection();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(controller.snapshot().messages).toHaveLength(2);
    expect(controller.send({ id: randomUUID(), text: "stale" }).ok).toBe(false);
    expect((await controller.clear()).ok).toBe(true);
    expect(controller.send({ id: randomUUID(), text: "fresh" }).ok).toBe(true);
  });
});
