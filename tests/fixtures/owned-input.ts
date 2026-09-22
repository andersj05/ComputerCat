import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { ComputerInput } from "../../src/main/desktop/computer-use";
import { WindowsInput } from "../../src/main/desktop/windows-input";
import type { InputMeasurement } from "../computer-use/metrics";

// Only for tests targeting owned synthetic windows. Production never retains provider stderr.
export function ownedInput(): ComputerInput & { measurements: InputMeasurement[] } {
  const measurements: InputMeasurement[] = [];
  let active: { sample: InputMeasurement; started: number } | undefined;
  const input = new WindowsInput({
    launch: (command, args, options) => {
      const started = Date.now();
      const child = spawn(command, args, { ...options, stdio: "pipe" });
      let diagnostics = "";
      let markers = "";
      child.stderr.on("data", (chunk: Buffer) => {
        diagnostics = (diagnostics + chunk.toString("utf8")).slice(-4096);
        markers = (markers + chunk.toString("utf8")).slice(-4096);
        if (active) {
          const elapsed = performance.now() - active.started;
          if (markers.includes("computer-input:init")) active.sample.initMs ??= elapsed;
          if (markers.includes("computer-input:ready")) active.sample.readyMs ??= elapsed;
          if (markers.includes("computer-input:request")) active.sample.requestMs ??= elapsed;
        }
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
  async function measure<T>(
    operation: string,
    target: string,
    run: () => Promise<T>,
    outcome: (result: T) => string,
  ): Promise<T> {
    if (active) throw new Error("Owned input measurements require serial operations.");
    const sample: InputMeasurement = { operation, target, outcome: "error", totalMs: 0 };
    const started = performance.now();
    active = { sample, started };
    try {
      const result = await run();
      sample.outcome = outcome(result);
      return result;
    } finally {
      sample.totalMs = performance.now() - started;
      measurements.push(sample);
      active = undefined;
    }
  }
  return {
    measurements,
    inspect: (source, signal, query) =>
      measure(
        query ? "inspect-search" : "inspect",
        query ?? "window",
        () => input.inspect(source, signal, query),
        () => "observed",
      ),
    act: (snapshot, element, action, signal) =>
      measure(
        action.kind,
        element.name,
        () => input.act(snapshot, element, action, signal),
        (result) =>
          result.status === "dispatched" ? "dispatched" : `${result.status}:${result.reason}`,
      ),
  };
}
