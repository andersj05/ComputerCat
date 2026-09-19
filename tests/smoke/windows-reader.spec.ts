import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, win32 } from "node:path";
import { createInterface } from "node:readline";
import { expect, test } from "@playwright/test";
import { WindowsReader } from "../../src/main/desktop/windows-reader";

test("native accessibility reads only an owned fixture, excludes passwords, and preserves selection", async () => {
  test.skip(process.platform !== "win32", "Windows UI Automation requires a Windows desktop.");
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("The Windows runtime directory is unavailable.");
  const script = await readFile(resolve("tests/fixtures/windows-reader.ps1"), "utf8");
  const child = spawn(
    win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Sta",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    {
      shell: false,
      windowsHide: true,
      stdio: "pipe",
      env: { SystemRoot: systemRoot, WINDIR: systemRoot },
    },
  );
  const closed = new Promise<void>((done) => child.once("close", () => done()));
  const failed = new Promise<never>((_, reject) => {
    child.on("error", () => reject(new Error("The synthetic UI fixture could not start.")));
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream.on("error", () => reject(new Error("The synthetic UI fixture lost its test pipe.")));
    }
  });
  // A failure can occur while UI Automation is reading, between nextLine calls.
  void failed.catch(() => {});
  child.stderr.resume();
  // Every HWND comes directly from this generated test window. No desktop scan,
  // screenshot, other application inspection, credentials, or model call occurs.
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  async function nextLine(): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const line = await Promise.race([
        iterator.next(),
        failed,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("The synthetic UI fixture timed out.")), 8_000);
        }),
      ]);
      if (line.done) throw new Error("The synthetic UI fixture exited unexpectedly.");
      return line.value;
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const ready = await nextLine();
    const handle = /^ready:([1-9]\d*)$/.exec(ready)?.[1];
    expect(handle).toBeTruthy();
    if (!handle) throw new Error("The synthetic UI fixture did not supply its window handle.");
    const result = await new WindowsReader().inspectWindow(handle, new AbortController().signal);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.title).toBe("Computer Cat accessibility fixture");
    expect(result.app).toBe("powershell");
    expect(result.text).toContain("A violet cat studies this example.");
    expect(result.selectedText).toBe("violet cat");
    expect(result.tabs).toEqual(["Alpha fixture tab", "Beta fixture tab"]);
    expect(JSON.stringify(result)).not.toContain("fixture-password-never-report");
    // Exercise the compiled foreground-selection code against this owned window.
    // Substitute only its starting HWND: never inspect the user's actual foreground.
    const currentReader = new WindowsReader({
      launch: (command, args, options) => {
        const encoded = args.at(-1);
        if (!encoded) throw new Error("Missing helper code");
        const code = Buffer.from(encoded, "base64").toString("utf16le");
        const original = "$candidate = [CatWindowTarget]::GetForegroundWindow()";
        if (!code.includes(original)) throw new Error("Unknown foreground fixture seam");
        const fixtureCode = code.replace(original, `$candidate = [IntPtr]::new(${handle})`);
        return spawn(
          command,
          [...args.slice(0, -1), Buffer.from(fixtureCode, "utf16le").toString("base64")],
          { ...options, stdio: "pipe" },
        );
      },
    });
    const current = await currentReader.inspectCurrentWindow(new AbortController().signal);
    expect(current).toMatchObject({
      nativeWindowId: handle,
      target: "foreground",
      title: result.title,
      selectedText: "violet cat",
      tabs: result.tabs,
    });
    expect(current.unavailableReason).toBeUndefined();
    child.stdin.write("status\n");
    expect(await nextLine()).toBe("status:2:10");
  } finally {
    lines.close();
    child.stdin.end();
    const killTimer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // The bounded close wait below reports failure without native details.
      }
    }, 1_000);
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        closed,
        new Promise<never>((_, reject) => {
          closeTimer = setTimeout(
            () => reject(new Error("The synthetic UI fixture did not close.")),
            3_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(killTimer);
      clearTimeout(closeTimer);
    }
  }
});
