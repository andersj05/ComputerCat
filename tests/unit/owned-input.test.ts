import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownedInput } from "../fixtures/owned-input";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const source = { id: "window:123:0", name: "Owned fixture", kind: "window" as const };
const snapshot = {
  windowHandle: "123",
  processId: 42,
  processStarted: "123",
  foreground: "123",
  lastInput: 1,
  title: source.name,
  app: "fixture",
  bounds: { x: 0, y: 0, width: 500, height: 400 },
  text: "Synthetic editor contents should not appear in measurements",
  truncated: false,
  elements: [],
};
function setup() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcessWithoutNullStreams);
  const input = ownedInput({ platform: "win32", environment: { SystemRoot: "C:\\Windows" } });
  const finish = () => {
    child.stdout.emit("data", Buffer.from(JSON.stringify(snapshot)));
    child.emit("close", 0);
  };
  return { input, child, finish };
}

beforeEach(() => vi.clearAllMocks());

describe("owned input measurement lifecycle", () => {
  it("captures split markers and serial outcomes without retaining observed contents", async () => {
    const { input, child, finish } = setup();
    const pending = input.inspect(source, new AbortController().signal);
    child.stderr.emit("data", Buffer.from("computer-input:in"));
    child.stderr.emit("data", Buffer.from("it\ncomputer-input:ready\ncomputer-input:request\n"));
    await expect(input.inspect(source, new AbortController().signal)).rejects.toThrow("serial");
    expect(spawn).toHaveBeenCalledOnce();
    finish();
    await expect(pending).resolves.toEqual(snapshot);
    expect(input.measurements).toHaveLength(1);
    const sample = input.measurements[0];
    expect(sample).toMatchObject({
      operation: "inspect",
      target: "window",
      outcome: "observed",
      initMs: expect.any(Number),
      readyMs: expect.any(Number),
      requestMs: expect.any(Number),
    });
    expect(sample?.totalMs).toBeGreaterThanOrEqual(sample?.requestMs ?? 0);
    expect(JSON.stringify(input.measurements)).not.toContain(snapshot.text);
    await input.close();
  });

  it("cancels and waits for the helper before completing teardown or recording final measurements", async () => {
    const { input, child, finish } = setup();
    const pending = input.inspect(source, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow("inspect before retrying");
    let closed = false;
    const closing = input.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledOnce();
    expect(closed).toBe(false);
    expect(input.measurements).toEqual([]);
    finish();
    await rejected;
    await closing;
    expect(closed).toBe(true);
    expect(input.measurements).toEqual([expect.objectContaining({ outcome: "error" })]);
    await input.close();
    await expect(input.inspect(source, new AbortController().signal)).rejects.toThrow();
    expect(spawn).toHaveBeenCalledOnce();
    expect(input.measurements).toHaveLength(1);
  });
});
