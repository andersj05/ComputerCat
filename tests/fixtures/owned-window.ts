import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, win32 } from "node:path";
import { createInterface } from "node:readline";

/** No enumeration: every target handle originates from a synthetic child owned by the test. */
export async function ownedWindow(scriptPath: string) {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("Windows is unavailable");
  const code = await readFile(resolve(scriptPath), "utf8");
  const child = spawn(
    win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Sta",
      "-EncodedCommand",
      Buffer.from(code, "utf16le").toString("base64"),
    ],
    {
      windowsHide: true,
      shell: false,
      stdio: "pipe",
      env: {
        SystemRoot: systemRoot,
        WINDIR: systemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PSModuleAnalysisCachePath: "NUL",
      },
    },
  );
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let diagnostics = "";
  child.stderr.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4096);
  });
  const failure = new Promise<never>((_, reject) => {
    child.on("error", reject);
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on("error", reject);
  });
  void failure.catch(() => {});
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  async function next(timeout = 8000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        iterator.next(),
        failure,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Owned fixture timed out: ${diagnostics}`)),
            timeout,
          );
        }),
      ]);
      if (result.done) throw new Error(`Owned fixture exited: ${diagnostics}`);
      return result.value;
    } finally {
      clearTimeout(timer);
    }
  }
  async function close() {
    lines.close();
    child.stdin.end();
    const kill = setTimeout(() => child.kill(), 1000);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        closed,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("Owned fixture did not close")), 4000);
        }),
      ]);
    } finally {
      clearTimeout(kill);
      clearTimeout(deadline);
    }
  }
  try {
    const handle = /^ready:([1-9]\d*)$/.exec(await next(30_000))?.[1];
    if (!handle) throw new Error(`Missing owned window handle: ${diagnostics}`);
    return {
      handle,
      close,
      command: async (command: string) => {
        child.stdin.write(`${command}\n`);
        return next();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
