import { type ChildProcessWithoutNullStreams, type SpawnOptions, spawn } from "node:child_process";
import { win32 } from "node:path";
import {
  type ComputerAction,
  type ComputerElement,
  type ComputerSnapshot,
  computerActionSchema,
  computerElementSchema,
  computerOutcomeSchema,
  computerSnapshotSchema,
} from "../../shared/computer-use";
import type { ComputerInput } from "./computer-use";
import type { DesktopSource } from "./controller";
import { WINDOWS_INPUT_SCRIPT } from "./windows-input-script";

// The fixed script travels over stdin to avoid Windows' command-line length limit.
const bootstrap =
  "[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false); $code = [Console]::In.ReadLine(); & ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($code))))";

interface Options {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  launch?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcessWithoutNullStreams;
}

/** Never settles a cancelled action until its helper exits: the broker must retain input ownership. */
export class WindowsInput implements ComputerInput {
  constructor(private readonly options: Options = {}) {}

  async inspect(
    source: DesktopSource,
    signal: AbortSignal,
    query?: string,
  ): Promise<ComputerSnapshot> {
    if (query !== undefined && (!query.trim() || query.length > 120))
      throw new Error("Invalid control search.");
    const handle =
      source.kind === "window" ? /^window:([1-9]\d{0,18}):\d+$/.exec(source.id)?.[1] : undefined;
    if (!handle || BigInt(handle) > 0x7fff_ffff_ffff_ffffn)
      throw new Error("Invalid window target.");
    return computerSnapshotSchema.parse(
      await this.run(
        {
          operation: "inspect",
          handle,
          title: source.name.slice(0, 512),
          ...(query !== undefined ? { query: query.trim() } : {}),
        },
        signal,
      ),
    );
  }

  async act(
    snapshot: ComputerSnapshot,
    element: ComputerElement,
    action: ComputerAction,
    signal: AbortSignal,
  ) {
    computerSnapshotSchema.parse(snapshot);
    computerElementSchema.parse(element);
    computerActionSchema.parse(action);
    const { elements: _elements, text: _text, ...identity } = snapshot;
    return computerOutcomeSchema.parse(
      await this.run({ operation: "act", snapshot: identity, element, action }, signal),
    );
  }

  private async run(request: object, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if ((this.options.platform ?? process.platform) !== "win32")
      throw new Error("Computer input currently requires Windows.");
    const environment = this.options.environment ?? process.env;
    const systemRoot = environment.SystemRoot ?? environment.WINDIR;
    if (!systemRoot || !win32.isAbsolute(systemRoot))
      throw new Error("Windows input is unavailable.");
    const env: NodeJS.ProcessEnv = {
      COMPUTERCAT_OWNER_PID: String(process.pid),
      PSModuleAnalysisCachePath: "NUL",
    };
    for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
      if (environment[key]) env[key] = environment[key];
    const launch =
      this.options.launch ??
      ((command, args, options) => spawn(command, args, { ...options, stdio: "pipe" }));
    const child = launch(
      win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Mta",
        "-EncodedCommand",
        Buffer.from(bootstrap, "utf16le").toString("base64"),
      ],
      { shell: false, windowsHide: true, stdio: "pipe", env },
    );
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      let failed = false;
      const stop = () => {
        failed = true;
        chunks.length = 0;
        try {
          child.kill();
        } catch {
          /* Ownership remains until close, even if termination fails. */
        }
      };
      const timer = setTimeout(stop, 12_000);
      signal.addEventListener("abort", stop, { once: true });
      child.on("error", stop);
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on("error", stop);
      child.stderr.resume(); // Never retain private accessibility/provider diagnostics.
      child.stdout.on("data", (chunk: Buffer) => {
        if (failed) return;
        bytes += chunk.length;
        if (bytes > 1_000_000) stop();
        else chunks.push(chunk);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        if (failed || signal.aborted || code !== 0) {
          reject(new Error("Native input ended; inspect before retrying."));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error("Invalid native input result; inspect before retrying."));
        }
      });
      if (signal.aborted) {
        stop();
        return;
      }
      child.stdin.end(
        `${Buffer.from(WINDOWS_INPUT_SCRIPT, "utf8").toString("base64")}\n${JSON.stringify(request)}`,
        "utf8",
      );
    });
  }
}
