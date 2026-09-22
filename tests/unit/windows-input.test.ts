import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowsInput } from "../../src/main/desktop/windows-input";
import { WINDOWS_INPUT_SCRIPT } from "../../src/main/desktop/windows-input-script";
import type { ComputerAction, ComputerElement } from "../../src/shared/computer-use";

const source = { id: "window:123:0", name: "Owned ' ` $() fixture", kind: "window" as const };
const state = {
  windowHandle: "123",
  processId: 42,
  processStarted: "123",
  foreground: "123",
  lastInput: 1,
  title: source.name,
  app: "fixture",
  bounds: { x: 0, y: 0, width: 500, height: 400 },
  text: "fixture",
  truncated: false,
  elements: [],
};
const element: ComputerElement = {
  runtimeId: [42, 1],
  name: "Message",
  role: "Edit",
  enabled: true,
  bounds: state.bounds,
  signature: "a".repeat(64),
  actions: ["fill", "type", "key"],
  value: "existing",
};
const fill: ComputerAction = {
  kind: "fill",
  elementId: "e1",
  text: "Literal $() ` draft\nCafé 🐈",
};
function setup() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  let payload = "";
  child.stdin.on("data", (chunk: Buffer) => {
    payload += chunk.toString("utf8");
  });
  const launch = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
  const input = new WindowsInput({
    platform: "win32",
    launch,
    environment: {
      SystemRoot: "C:\\Windows",
      TEMP: "C:\\Temp",
      PATH: "untrusted",
      OPENAI_API_KEY: "secret",
      PSModulePath: "untrusted",
      NODE_OPTIONS: "untrusted",
    },
  });
  const finish = (result: unknown = state) => {
    child.stdout.emit("data", Buffer.from(JSON.stringify(result)));
    child.emit("close", 0);
  };
  return { child, launch, input, finish, payload: () => payload };
}
afterEach(() => vi.useRealTimers());

describe("Windows input process ownership", () => {
  it("uses a fixed hidden helper, preserves literal JSON, and excludes ambient credentials", async () => {
    const { input, launch, finish, payload } = setup();
    const pending = input.inspect(source, new AbortController().signal);
    const args = launch.mock.calls[0];
    expect(args).toEqual([
      expect.stringContaining("System32"),
      expect.any(Array),
      {
        shell: false,
        windowsHide: true,
        stdio: "pipe",
        env: {
          SystemRoot: "C:\\Windows",
          TEMP: "C:\\Temp",
          COMPUTERCAT_OWNER_PID: String(process.pid),
          PSModuleAnalysisCachePath: "NUL",
        },
      },
    ]);
    const [script, json, end] = payload().split("\n");
    expect(end).toBe("");
    expect(Buffer.from(script ?? "", "base64").toString("utf8")).toBe(WINDOWS_INPUT_SCRIPT);
    expect(JSON.parse(json ?? "")).toEqual({
      operation: "inspect",
      handle: "123",
      title: source.name,
    });
    finish();
    await expect(pending).resolves.toEqual(state);
  });

  it("transports search text as data and rejects unbounded searches before launch", async () => {
    const { input, launch, finish, payload } = setup();
    const query = "Reply ' $()";
    const pending = input.inspect(source, new AbortController().signal, query);
    expect(JSON.parse(payload().split("\n")[1] ?? "")).toMatchObject({ query });
    finish();
    await pending;
    for (const invalid of [" ", "x".repeat(121)])
      await expect(input.inspect(source, new AbortController().signal, invalid)).rejects.toThrow(
        "Invalid control search",
      );
    expect(launch).toHaveBeenCalledOnce();
  });

  it.each(
    ["abort", "timeout", "overflow", "stdin", "stdout", "stderr", "process"].flatMap((cause) =>
      ["inspect", "act"].map((operation) => ({ cause, operation })),
    ),
  )("kills $operation on $cause but holds ownership until close", async ({ cause, operation }) => {
    vi.useFakeTimers();
    const { input, child, finish } = setup();
    const abort = new AbortController();
    let settled = false;
    const pending = (
      operation === "inspect"
        ? input.inspect(source, abort.signal)
        : input.act(state, element, fill, abort.signal)
    ).finally(() => {
      settled = true;
    });
    const rejected = expect(pending).rejects.toThrow("inspect before retrying");
    if (cause === "abort") abort.abort();
    if (cause === "timeout") await vi.advanceTimersByTimeAsync(12_001);
    if (cause === "overflow") child.stdout.emit("data", Buffer.alloc(1_000_001));
    if (cause === "stdin" || cause === "stdout" || cause === "stderr")
      child[cause].emit("error", new Error("private diagnostic"));
    if (cause === "process") child.emit("error", new Error("private diagnostic"));
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalled();
    expect(settled).toBe(false);
    finish();
    await rejected;
    expect(settled).toBe(true);
  });

  it("sends only action identity plus literal text and waits for complete UTF-8 frames", async () => {
    const { input, payload, child } = setup();
    const pending = input.act(
      { ...state, text: "unrelated screen text", elements: [element] },
      element,
      fill,
      new AbortController().signal,
    );
    const request = JSON.parse(payload().split("\n")[1] ?? "");
    expect(request).toMatchObject({ operation: "act", element, action: fill });
    expect(request.snapshot).not.toHaveProperty("elements");
    expect(request.snapshot).not.toHaveProperty("text");
    const response = {
      status: "dispatched",
      reason: "ok",
      snapshot: { ...state, text: "Café 🐈" },
    };
    const bytes = Buffer.from(JSON.stringify(response));
    // Bytewise delivery splits the multibyte characters and the JSON framing.
    for (const byte of bytes) child.stdout.emit("data", Buffer.from([byte]));
    child.emit("close", 0);
    await expect(pending).resolves.toEqual(response);
  });

  it.each(["nonzero", "invalid JSON", "invalid outcome"])(
    "sanitizes %s action failures",
    async (cause) => {
      const { input, child } = setup();
      const pending = input.act(state, element, fill, new AbortController().signal);
      child.stderr.emit("data", Buffer.from("private provider diagnostics"));
      child.stdout.emit(
        "data",
        Buffer.from(
          cause === "invalid outcome"
            ? '{"status":"dispatched","reason":"unknown"}'
            : "private invalid JSON",
        ),
      );
      child.emit("close", cause === "nonzero" ? 1 : 0);
      await expect(pending).rejects.not.toThrow(/private/);
    },
  );

  it("rejects invalid targets and pre-cancelled calls before starting a process", async () => {
    const { input, launch } = setup();
    const abort = new AbortController();
    for (const id of [
      "window:0:0",
      "window:9223372036854775808:0",
      "window:123;whoami:0",
      "screen:1:0",
    ])
      await expect(input.inspect({ ...source, id }, abort.signal)).rejects.toThrow();
    abort.abort();
    await expect(input.inspect(source, abort.signal)).rejects.toThrow();
    expect(launch).not.toHaveBeenCalled();
  });

  it("rejects malformed or oversized native observations", async () => {
    const { input, finish } = setup();
    const pending = input.inspect(source, new AbortController().signal);
    finish({ ...state, text: "x".repeat(12001), unknown: true });
    await expect(pending).rejects.toThrow();
  });
});
