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
  let diagnostics = "";
  child.stderr.on("data", (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4096);
  });
  let rejectFailure!: (error: Error) => void;
  let terminalError: Error | undefined;
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  void failure.catch(() => {});
  const fail = (error: Error) => {
    terminalError ??= error;
    rejectFailure(terminalError);
  };
  child.on("error", fail);
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on("error", fail);
  let exited = false;
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => {
      exited = true;
      fail(new Error(`Owned fixture exited: ${diagnostics}`));
      resolve();
    }),
  );
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
  let closing: Promise<void> | undefined;
  function close() {
    closing ??= (async () => {
      fail(new Error("Owned fixture is closing"));
      lines.close();
      if (exited) return;
      child.stdin.end();
      const kill = setTimeout(() => {
        if (!exited) child.kill();
      }, 1000);
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
    })();
    return closing;
  }
  async function stopAfterFailure(error: unknown): Promise<never> {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Owned fixture failed and could not close");
    }
    throw error;
  }
  try {
    const handle = /^ready:([1-9]\d*)$/.exec(await next(30_000))?.[1];
    if (!handle) throw new Error(`Missing owned window handle: ${diagnostics}`);
    let active = false;
    return {
      handle,
      close,
      command: async (command: string) => {
        if (terminalError) throw terminalError;
        if (active) throw new Error("Owned fixture commands must be serial");
        if (!command || /[\r\n\0]/.test(command))
          throw new Error("Owned fixture commands must be a single nonempty line");
        active = true;
        try {
          child.stdin.write(`${command}\n`);
          return await next();
        } catch (error) {
          // A timed-out read still owns its reply. Never let another command reuse this channel.
          return await stopAfterFailure(error);
        } finally {
          active = false;
        }
      },
    };
  } catch (error) {
    return stopAfterFailure(error);
  }
}
