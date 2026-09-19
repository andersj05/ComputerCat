import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowsReader } from "../../src/main/desktop/windows-reader";

const sample = {
  title: "Example – Window",
  app: "example",
  text: "A visible paragraph. Café 🐈",
  selectedText: "visible paragraph",
  tabs: ["Home", "Documentation"],
  truncated: false,
};

function setup(platform: NodeJS.Platform = "win32") {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(() => true),
  });
  const launch = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
  const reader = new WindowsReader({
    platform,
    environment: {
      SystemRoot: "C:\\Windows",
      WINDIR: "C:\\Windows",
      TEMP: "C:\\Temp",
      TMP: "C:\\Temp",
      PATH: "untrusted-program-folder",
      OPENAI_API_KEY: "private-key",
      NODE_OPTIONS: "untrusted-runtime-options",
      PSModulePath: "untrusted-modules",
      COMPUTERCAT_WINDOW_HANDLE: "wrong-window",
    },
    launch,
  });
  const finish = (value: unknown = sample, code: number | null = 0) => {
    child.stdout.emit("data", Buffer.from(JSON.stringify(value), "utf8"));
    child.emit("close", code);
  };
  return { reader, child, launch, finish };
}

afterEach(() => vi.useRealTimers());

describe("read-only Windows accessibility supervisor", () => {
  it("starts a hidden, fixed Windows helper with only validated input and allowlisted environment", async () => {
    const { reader, launch, finish } = setup();
    const result = reader.inspectWindow("123456", new AbortController().signal);
    expect(launch).toHaveBeenCalledExactlyOnceWith(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Mta", "-EncodedCommand", expect.any(String)],
      {
        env: {
          SystemRoot: "C:\\Windows",
          WINDIR: "C:\\Windows",
          TEMP: "C:\\Temp",
          TMP: "C:\\Temp",
          COMPUTERCAT_WINDOW_HANDLE: "123456",
          COMPUTERCAT_OWNER_PID: String(process.pid),
        },
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      },
    );
    finish();
    await expect(result).resolves.toEqual(sample);
  });

  it.each(["", "0", "-1", "01", "1.1", " 123", "1\n", "0x123", "1;whoami", "9223372036854775808"])(
    "rejects invalid native handle %j without launching a process",
    async (handle) => {
      const { reader, launch } = setup();
      expect(await reader.inspectWindow(handle, new AbortController().signal)).toMatchObject({
        unavailableReason: expect.stringContaining("window"),
        text: "",
      });
      expect(launch).not.toHaveBeenCalled();
    },
  );

  it("does not start after cancellation, including a private abort reason", async () => {
    const { reader, launch } = setup();
    const abort = new AbortController();
    abort.abort(new Error("private-message"));
    await expect(reader.inspectWindow("12", abort.signal)).rejects.toMatchObject({
      name: "AbortError",
      message: "Desktop reading was cancelled.",
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it("reports unsupported systems and missing Windows paths without shell fallback", async () => {
    const { reader, launch } = setup("linux");
    expect(await reader.inspectWindow("12", new AbortController().signal)).toMatchObject({
      unavailableReason: expect.stringContaining("Windows only"),
    });
    const missingWindows = new WindowsReader({ platform: "win32", environment: {}, launch });
    expect(await missingWindows.inspectWindow("12", new AbortController().signal)).toMatchObject({
      unavailableReason: expect.stringContaining("unavailable"),
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it("decodes UTF-8 after all chunks arrive, preserving boundaries inside multibyte text", async () => {
    const { reader, child } = setup();
    const result = reader.inspectWindow("12", new AbortController().signal);
    const bytes = Buffer.from(JSON.stringify(sample));
    const split = bytes.indexOf(Buffer.from("🐈")) + 1;
    child.stdout.emit("data", bytes.subarray(0, split));
    child.stdout.emit("data", bytes.subarray(split));
    child.emit("close", 0);
    await expect(result).resolves.toEqual(sample);
  });

  it("kills a hung provider on cancellation and discards late results", async () => {
    const { reader, child, finish } = setup();
    const abort = new AbortController();
    const result = reader.inspectWindow("12", abort.signal);
    child.stdout.emit("data", Buffer.from('{"text":"private partial'));
    abort.abort();
    finish();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("kills a hung provider at the fixed deadline and removes the abort listener", async () => {
    vi.useFakeTimers();
    const { reader, child, finish } = setup();
    const abort = new AbortController();
    const result = reader.inspectWindow("12", abort.signal);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(result).resolves.toMatchObject({
      unavailableReason: expect.stringContaining("did not respond"),
      text: "",
    });
    abort.abort();
    finish();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("kills output overflow without parsing, retaining, or returning partial private data", async () => {
    const { reader, child, finish } = setup();
    const result = reader.inspectWindow("12", new AbortController().signal);
    child.stdout.emit("data", Buffer.alloc(256 * 1024 + 1, "x"));
    finish();
    await expect(result).resolves.toMatchObject({
      unavailableReason: expect.stringContaining("too much"),
      text: "",
      selectedText: "",
    });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it.each([
    { ...sample, text: "x".repeat(12_001) },
    { ...sample, selectedText: "x".repeat(4_001) },
    { ...sample, tabs: Array.from({ length: 61 }, () => "tab") },
    { ...sample, tabs: ["x".repeat(257)] },
    { ...sample, title: "x".repeat(513) },
    { ...sample, app: "x".repeat(121) },
    { ...sample, unavailableReason: "private-native-error" },
    { ...sample, extra: "private-data" },
    { ...sample, truncated: "yes" },
    { text: "only a fragment" },
    null,
  ])("sanitizes malformed or unbounded helper output %#", async (value) => {
    const { reader, finish } = setup();
    const result = reader.inspectWindow("12", new AbortController().signal);
    finish(value);
    await expect(result).resolves.toEqual({
      title: "",
      app: "",
      text: "",
      selectedText: "",
      tabs: [],
      truncated: false,
      unavailableReason: "The application returned unreadable accessibility data.",
    });
  });

  it("does not expose native errors or stderr and tolerates a kill failure", async () => {
    const { reader, child } = setup();
    child.kill.mockImplementation(() => {
      throw new Error("private kill details");
    });
    const result = reader.inspectWindow("12", new AbortController().signal);
    child.stderr.emit("data", Buffer.from("private window title or native path"));
    child.emit("error", new Error("private process path"));
    await expect(result).resolves.toMatchObject({
      unavailableReason: "Windows accessibility reading could not start. Try again.",
      text: "",
    });
  });

  it("reports launch exceptions and a crashed helper without leaking their output", async () => {
    const { reader, launch, finish } = setup();
    launch.mockImplementationOnce(() => {
      throw new Error("private launch details");
    });
    await expect(reader.inspectWindow("12", new AbortController().signal)).resolves.toMatchObject({
      unavailableReason: "Windows accessibility reading could not start. Try again.",
    });
    const result = reader.inspectWindow("12", new AbortController().signal);
    finish(sample, 1);
    await expect(result).resolves.toMatchObject({
      unavailableReason: "Windows accessibility reading ended unexpectedly.",
      text: "",
    });
  });

  it("maps expected provider failures to a readable limitation and keeps partial-result markers", async () => {
    const { reader, finish } = setup();
    const unavailable = reader.inspectWindow("12", new AbortController().signal);
    finish({ ...sample, unavailableReason: "window-unavailable" });
    await expect(unavailable).resolves.toMatchObject({
      unavailableReason: expect.stringContaining("does not expose"),
      text: "",
    });
    const other = setup();
    const truncated = other.reader.inspectWindow("12", new AbortController().signal);
    other.finish({ ...sample, truncated: true });
    await expect(truncated).resolves.toMatchObject({ truncated: true, text: sample.text });
  });
});
