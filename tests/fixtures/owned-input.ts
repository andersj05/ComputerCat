import { spawn } from "node:child_process";
import { WindowsInput } from "../../src/main/desktop/windows-input";

// Only for tests targeting owned synthetic windows. Production never retains provider stderr.
export function ownedInput(): WindowsInput {
  return new WindowsInput({
    launch: (command, args, options) => {
      const started = Date.now();
      const child = spawn(command, args, { ...options, stdio: "pipe" });
      let diagnostics = "";
      child.stderr.on("data", (chunk: Buffer) => {
        diagnostics = (diagnostics + chunk.toString("utf8")).slice(-4096);
      });
      child.once("close", (code, signal) => {
        if (code !== 0)
          console.error("Owned input helper failed", {
            elapsedMs: Date.now() - started,
            code,
            signal,
            diagnostics,
          });
      });
      return child;
    },
  });
}
