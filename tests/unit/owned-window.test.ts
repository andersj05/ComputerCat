import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownedWindow } from "../fixtures/owned-window";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

function setup({ graceful = true, killable = true } = {}) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      if (killable) exit();
      return killable;
    }),
  });
  let exited = false;
  function exit() {
    if (exited) return;
    exited = true;
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 0);
  }
  child.stdin.on("finish", () => {
    if (graceful) exit();
  });
  const commands: string[] = [];
  child.stdin.on("data", (chunk: Buffer) => commands.push(chunk.toString()));
  vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcessWithoutNullStreams);
  const pending = ownedWindow("synthetic-fixture.ps1");
  const start = async () => {
    await Promise.resolve();
    child.stdout.write("ready:123\n");
    return pending;
  };
  return { child, commands, pending, start, exit };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SystemRoot", "C:\\Windows");
  vi.mocked(readFile).mockResolvedValue("# fixed owned fixture");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("owned native window protocol", () => {
  it("uses only its child's handle, serializes replies, and closes idempotently", async () => {
    const { child, commands, start } = setup();
    const fixture = await start();
    expect(fixture.handle).toBe("123");
    expect(spawn).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      expect.arrayContaining(["-NoProfile", "-NonInteractive", "-Sta", "-EncodedCommand"]),
      expect.objectContaining({ windowsHide: true, shell: false, stdio: "pipe" }),
    );
    const first = fixture.command("status");
    await expect(fixture.command("edit")).rejects.toThrow("serial");
    expect(commands).toEqual(["status\n"]);
    child.stdout.write('{"status":"Unsent"}\n');
    await expect(first).resolves.toBe('{"status":"Unsent"}');
    const second = fixture.command("edit");
    child.stdout.write("edited\n");
    await expect(second).resolves.toBe("edited");
    await Promise.all([fixture.close(), fixture.close()]);
    await expect(fixture.command("status")).rejects.toThrow("closing");
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("rejects multi-command payloads without poisoning the fixture", async () => {
    const { child, commands, start } = setup();
    const fixture = await start();
    for (const invalid of ["", "status\nedit", "status\redit", "status\0"])
      await expect(fixture.command(invalid)).rejects.toThrow("single nonempty line");
    expect(commands).toEqual([]);
    const valid = fixture.command("status");
    child.stdout.write("unsent\n");
    await expect(valid).resolves.toBe("unsent");
    await fixture.close();
  });

  it.each(["not-a-handle", "ready:0", "ready:-1"])(
    "closes after an invalid startup handshake: %s",
    async (line) => {
      const { child, pending } = setup();
      await Promise.resolve();
      child.stdout.write(`${line}\n`);
      await expect(pending).rejects.toThrow("Missing owned window handle");
      expect(child.stdin.writableEnded).toBe(true);
    },
  );

  it("kills a stuck startup and clears its deadlines", async () => {
    vi.useFakeTimers();
    const { child, pending } = setup({ graceful: false });
    const rejected = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(31_000);
    await rejected;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes on command timeout and never reuses a delayed reply", async () => {
    vi.useFakeTimers();
    const { child, commands, start } = setup({ graceful: false });
    const fixture = await start();
    let settled = false;
    const failed = fixture.command("status").finally(() => {
      settled = true;
    });
    const rejected = expect(failed).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(8000);
    expect(settled).toBe(false);
    child.stdout.write("delayed-status\n");
    await expect(fixture.command("edit")).rejects.toThrow("closing");
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(commands).toEqual(["status\n"]);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["stdin", "stdout", "stderr", "process"] as const)(
    "closes and preserves a %s failure during a command",
    async (surface) => {
      const { child, start } = setup();
      const fixture = await start();
      const pending = fixture.command("status");
      const target = surface === "process" ? child : child[surface];
      target.emit("error", new Error("synthetic pipe failure"));
      await expect(pending).rejects.toThrow("synthetic pipe failure");
      await expect(fixture.command("edit")).rejects.toThrow("synthetic pipe failure");
      expect(child.stdin.writableEnded).toBe(true);
    },
  );

  it("settles a pending command when the fixture crashes", async () => {
    const { child, exit, start } = setup();
    const fixture = await start();
    const pending = fixture.command("status");
    child.stderr.write("synthetic crash details");
    exit();
    await expect(pending).rejects.toThrow("Owned fixture exited: synthetic crash details");
    await fixture.close();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("cancels a pending command when teardown starts and waits for exit", async () => {
    vi.useFakeTimers();
    const { child, start } = setup({ graceful: false });
    const fixture = await start();
    const rejected = expect(fixture.command("status")).rejects.toThrow("closing");
    let closed = false;
    const closing = fixture.close().then(() => {
      closed = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([closing, rejected]);
    expect(closed).toBe(true);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the original failure and reports an unsuccessful teardown", async () => {
    vi.useFakeTimers();
    const { child, start, exit } = setup({ graceful: false, killable: false });
    const fixture = await start();
    const failed = fixture.command("status");
    const rejected = expect(failed).rejects.toMatchObject({
      message: "Owned fixture failed and could not close",
      errors: [
        expect.objectContaining({ message: "synthetic failure" }),
        expect.objectContaining({ message: "Owned fixture did not close" }),
      ],
    });
    child.emit("error", new Error("synthetic failure"));
    await vi.advanceTimersByTimeAsync(4000);
    await rejected;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    exit();
  });
});
