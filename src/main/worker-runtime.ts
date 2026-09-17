import { randomUUID } from "node:crypto";
import { type UtilityProcess, utilityProcess } from "electron";
import { workerEnvironment } from "../agent/config";
import { workerEventSchema } from "../agent/protocol";
import { type AgentRuntime, UserFacingError } from "../agent/runtime";

export class WorkerRuntime implements AgentRuntime {
  private child: UtilityProcess | undefined;
  private finish: ((error?: Error) => void) | undefined;
  private faulted = false;

  constructor(
    private readonly entry: string,
    private readonly cwd: string,
  ) {}

  async run(prompt: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<void> {
    signal.throwIfAborted();
    if (this.finish) throw new UserFacingError("A reply is already in progress.");
    if (this.faulted)
      throw new UserFacingError(
        "The model session was interrupted. Start a new chat to reconnect.",
      );
    const child =
      this.child ??
      utilityProcess.fork(this.entry, [], {
        cwd: this.cwd,
        env: workerEnvironment(process.env),
        serviceName: "Computer Cat agent",
        stdio: "ignore",
      });
    this.child = child;
    const id = randomUUID();
    await new Promise<void>((resolve, reject) => {
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = setTimeout(() => {
        this.faulted = true;
        child.kill();
        finish(new UserFacingError("The model took too long. Start a new chat to reconnect."));
      }, 120_000);
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        clearTimeout(stopTimer);
        signal.removeEventListener("abort", stop);
        child.removeListener("message", message);
        child.removeListener("exit", exited);
        this.finish = undefined;
        if (error) reject(error);
        else resolve();
      };
      this.finish = finish;
      const message = (input: unknown) => {
        const parsed = workerEventSchema.safeParse(input);
        if (!parsed.success || parsed.data.id !== id) return;
        const event = parsed.data;
        if (event.type === "delta" && !signal.aborted) onDelta(event.text);
        if (event.type === "done") finish();
        if (event.type === "error") finish(new UserFacingError(event.message));
      };
      const exited = () => {
        this.child = undefined;
        this.faulted = true;
        finish(
          new UserFacingError(
            "The model session closed unexpectedly. Start a new chat to reconnect.",
          ),
        );
      };
      const stop = () => {
        child.postMessage({ type: "stop", id });
        stopTimer = setTimeout(() => {
          this.faulted = true;
          child.kill();
          this.child = undefined;
          finish();
        }, 2000);
      };
      child.on("message", message);
      child.once("exit", exited);
      signal.addEventListener("abort", stop, { once: true });
      child.postMessage({ type: "run", id, prompt });
    });
  }

  dispose(): void {
    this.finish?.();
    this.child?.kill();
    this.child = undefined;
  }
}
