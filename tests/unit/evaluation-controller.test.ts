import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvaluationController } from "../../src/main/evaluation-controller";
import { readEvaluationStatus } from "../../src/main/evaluation-jobs";
import type { EvaluationRequest } from "../../src/shared/evaluations";

class Child extends EventEmitter {
  sent: unknown[] = [];
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  kill = vi.fn(() => this.emit("exit", 0));
}
const roots: string[] = [];
const controllers: EvaluationController[] = [];
afterEach(async () => {
  await Promise.all(controllers.splice(0).map((controller) => controller.dispose()));
  for (const root of roots.splice(0)) {
    if (resolve(root).startsWith(join(tmpdir(), "computercat-eval-bridge-")))
      await rm(root, { recursive: true, force: true });
  }
});
async function setup(allowLive = true) {
  const root = await mkdtemp(join(tmpdir(), "computercat-eval-bridge-"));
  roots.push(root);
  const auth = {
    snapshot: () => ({ connected: true, storageAvailable: true, login: null, message: null }),
    catalog: () => [{ id: "gpt-5.6-luna", name: "Luna", reasoning: ["medium" as const] }],
    accessToken: vi.fn(async (_signal: AbortSignal) => "private-test-access"),
  };
  const child = new Child();
  const spawn = vi.fn(() => child);
  const controller = new EvaluationController(root, auth, spawn, allowLive);
  controllers.push(controller);
  const request: EvaluationRequest = {
    kind: "computer-cat-evaluation",
    job: randomUUID(),
    action: "run",
    run: "fixture-run",
    repeats: 1,
  };
  return { root, auth, child, spawn, controller, request };
}
async function done(root: string, job: string) {
  await expect
    .poll(async () => (await readEvaluationStatus(root, job))?.state, { timeout: 3000 })
    .not.toBe("running");
  return readEvaluationStatus(root, job);
}

describe("app-owned evaluation authentication", () => {
  it("uses the active connection for a no-model check, including in offline-only hosts", async () => {
    const { root, controller, request, auth, spawn } = await setup(false);
    await controller.receive({ ...request, action: "check" });
    expect((await readEvaluationStatus(root, request.job))?.state).toBe("passed");
    expect(auth.accessToken).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
  it("passes only access tokens on the private child channel, preserves progress and rejects replay", async () => {
    const { root, controller, request, auth, spawn, child } = await setup();
    await controller.receive(request);
    const id = randomUUID();
    child.emit("message", { type: "token-request", id });
    await expect.poll(() => child.sent.length).toBe(2);
    expect(child.sent[1]).toEqual({ type: "token", id, token: "private-test-access" });
    child.emit("message", { type: "progress", message: "A synthetic task passed." });
    child.emit("message", { type: "finished", passed: true });
    const status = await done(root, request.job);
    expect(status?.state).toBe("passed");
    expect(JSON.stringify(status)).not.toContain("private-test-access");
    expect(status?.messages).toContain("A synthetic task passed.");
    await controller.receive(request);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(auth.accessToken).toHaveBeenCalledTimes(1);
  });
  it("blocks overlapping runs without starting another worker", async () => {
    const { root, controller, request, spawn, child } = await setup();
    await controller.receive(request);
    const second = { ...request, job: randomUUID() };
    await controller.receive(second);
    expect((await readEvaluationStatus(root, second.job))?.state).toBe("failed");
    expect(spawn).toHaveBeenCalledTimes(1);
    child.emit("message", { type: "finished", passed: true });
    await done(root, request.job);
  });
  it("cancels in-flight authentication without leaking its late token and waits for rotation to settle", async () => {
    const { root, controller, request, child, auth } = await setup();
    let resolveToken!: (token: string) => void;
    auth.accessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
    );
    await controller.receive(request);
    child.emit("message", { type: "token-request", id: randomUUID() });
    await controller.receive({ ...request, action: "cancel" });
    expect(auth.accessToken.mock.calls[0]?.[0].aborted).toBe(true);
    expect(child.sent).toContainEqual({ type: "cancel" });
    child.emit("message", { type: "finished", passed: false });
    resolveToken("late-private-test-access");
    expect((await done(root, request.job))?.state).toBe("failed");
    expect(JSON.stringify(child.sent)).not.toContain("late-private-test-access");
  });
  it("refuses live requests in CI/smoke mode and invalid payloads before authentication", async () => {
    const { root, controller, request, spawn, auth } = await setup(false);
    await controller.receive({ ...request, repeats: 999 });
    await controller.receive({ ...request, executable: "arbitrary-code" });
    expect(await readEvaluationStatus(root, request.job)).toBeUndefined();
    await controller.receive(request);
    expect((await readEvaluationStatus(root, request.job))?.state).toBe("failed");
    expect(spawn).not.toHaveBeenCalled();
    expect(auth.accessToken).not.toHaveBeenCalled();
    await expect(readEvaluationStatus(root, "../outside")).rejects.toThrow();
  });
  it("fails closed on duplicate token requests and worker crashes", async () => {
    const { root, controller, request, child, auth } = await setup();
    await controller.receive(request);
    const id = randomUUID();
    child.emit("message", { type: "token-request", id });
    await expect.poll(() => child.sent.length).toBe(2);
    child.emit("message", { type: "token-request", id });
    expect((await done(root, request.job))?.state).toBe("failed");
    expect(auth.accessToken).toHaveBeenCalledTimes(1);
    const next = { ...request, job: randomUUID() };
    await controller.receive(next);
    child.emit("exit", 1);
    expect((await done(root, next.job))?.state).toBe("failed");
  });
});
