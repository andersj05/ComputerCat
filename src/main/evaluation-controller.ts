import type { CodexAuth } from "../agent/codex-auth";
import {
  EVALUATION_MODEL,
  EVALUATION_REASONING,
  type EvaluationRequest,
  type EvaluationStatus,
  evaluationRequestSchema,
  evaluationWorkerEventSchema,
} from "../shared/evaluations";
import { readEvaluationStatus, writeEvaluationStatus } from "./evaluation-jobs";

export interface EvaluationChild {
  postMessage(message: unknown): void;
  on(event: "message", listener: (message: unknown) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  kill(): unknown;
}

/** Development-only jobs use the app's existing auth owner; no credential endpoint is exposed. */
export class EvaluationController {
  private active: { job: string; abort: AbortController; done: Promise<void> } | undefined;
  private accepting: Promise<unknown> = Promise.resolve();
  private closing = false;

  constructor(
    private readonly root: string,
    private readonly auth: Pick<CodexAuth, "snapshot" | "catalog" | "accessToken">,
    private readonly spawn: () => EvaluationChild,
    private readonly allowLive: boolean,
    private readonly connect?: (signal: AbortSignal) => Promise<void>,
  ) {}

  get busy(): boolean {
    return this.active !== undefined;
  }

  receive(input: unknown): Promise<void> {
    const next = this.accepting.then(() => this.accept(input));
    this.accepting = next.catch(() => {});
    return next;
  }

  private async accept(input: unknown) {
    const parsed = evaluationRequestSchema.safeParse(input);
    if (!parsed.success || this.closing) return;
    const request = parsed.data;
    if (request.action === "cancel") {
      if (this.active?.job === request.job) this.active.abort.abort();
      else if (!(await readEvaluationStatus(this.root, request.job)))
        await writeEvaluationStatus(this.root, {
          job: request.job,
          state: "failed",
          messages: ["Evaluation cancelled before starting."],
        });
      return;
    }
    // A replay must never cause another paid run.
    if (await readEvaluationStatus(this.root, request.job)) return;
    const status: EvaluationStatus = { job: request.job, state: "running", messages: [] };
    const fail = async (message: string) => {
      status.state = "failed";
      status.messages.push(message);
      await writeEvaluationStatus(this.root, status);
    };
    if (request.action === "check" && !this.auth.snapshot().connected) {
      await fail(
        "Computer Cat is not connected. Open Options → Models in this running app. No model request made.",
      );
      return;
    }
    if (
      !this.auth
        .catalog()
        .some(
          (model) =>
            model.id === EVALUATION_MODEL && model.reasoning.includes(EVALUATION_REASONING),
        )
    ) {
      await fail("Luna / Medium is unavailable in the pinned SDK. No fallback model was used.");
      return;
    }
    if (request.action === "check") {
      status.state = "passed";
      status.messages.push(
        `Ready: ${EVALUATION_MODEL}, ${EVALUATION_REASONING}; using the running Computer Cat connection. No model request made.`,
      );
      await writeEvaluationStatus(this.root, status);
      return;
    }
    if (!this.allowLive) {
      await fail("Live model evaluations are disabled in smoke tests and CI.");
      return;
    }
    if (this.active) {
      await fail(
        "A live evaluation is already running. Wait for it or stop its command with Ctrl+C.",
      );
      return;
    }
    status.messages.push(
      this.auth.snapshot().connected
        ? "Using Computer Cat's active connection; Luna / Medium. You can leave the cat open."
        : "Computer Cat needs a connection. Complete its browser sign-in; this command will continue automatically. Ctrl+C cancels.",
    );
    await writeEvaluationStatus(this.root, status);
    const abort = new AbortController();
    const current = { job: request.job, abort, done: Promise.resolve() };
    this.active = current;
    current.done = (async () => {
      if (!this.auth.snapshot().connected) await this.connect?.(abort.signal);
      if (!this.auth.snapshot().connected) throw new Error("No active connection.");
      await this.run(request, status, abort.signal);
    })()
      .catch(async () => {
        status.state = "failed";
        status.messages.push(
          abort.signal.aborted
            ? "Evaluation cancelled."
            : "The app connection or evaluation could not complete. Check Options → Models and retry.",
        );
        await writeEvaluationStatus(this.root, status);
      })
      .finally(() => {
        if (this.active === current) this.active = undefined;
      });
    void current.done.catch(() => console.error("Could not save the local evaluation status."));
  }

  private async run(request: EvaluationRequest, status: EvaluationStatus, signal: AbortSignal) {
    let child: EvaluationChild | undefined;
    let writes: Promise<void> = Promise.resolve();
    const pendingAuth = new Set<Promise<void>>();
    const publish = () => {
      const snapshot = structuredClone(status);
      writes = writes.then(() => writeEvaluationStatus(this.root, snapshot));
      // Observe errors immediately; awaited below before reporting completion.
      void writes.catch(() => {});
    };
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let lifetime: ReturnType<typeof setTimeout> | undefined;
    let stopped: (() => void) | undefined;
    try {
      child = this.spawn();
      const worker = child;
      const passed = await new Promise<boolean>((resolve, reject) => {
        let finished = false;
        const complete = (value?: boolean) => {
          if (finished) return;
          finished = true;
          if (value === undefined) reject(new Error("Evaluation worker stopped unexpectedly."));
          else resolve(value);
        };
        stopped = () => {
          try {
            worker.postMessage({ type: "cancel" });
          } catch {
            complete(false);
          }
          stopTimer ??= setTimeout(() => {
            worker.kill();
            complete(false);
          }, 35000);
        };
        signal.addEventListener("abort", stopped, { once: true });
        lifetime = setTimeout(() => {
          worker.kill();
          complete(false);
        }, 60 * 60_000);
        const requested = new Set<string>();
        worker.on("exit", () => complete());
        worker.on("message", (input) => {
          if (finished) return;
          const parsed = evaluationWorkerEventSchema.safeParse(input);
          if (!parsed.success) {
            complete();
            return;
          }
          const event = parsed.data;
          if (event.type === "finished") {
            complete(event.passed);
            return;
          }
          if (event.type === "error") {
            complete();
            return;
          }
          if (event.type === "progress") {
            if (status.messages.length >= 95) {
              complete();
              return;
            }
            status.messages.push(event.message);
            publish();
            return;
          }
          if (
            signal.aborted ||
            requested.has(event.id) ||
            requested.size >= 36 ||
            pendingAuth.size
          ) {
            complete(false);
            return;
          }
          requested.add(event.id);
          const operation = this.auth
            .accessToken(signal)
            .then((token) => {
              if (!signal.aborted && !finished)
                worker.postMessage({ type: "token", id: event.id, token });
            })
            .catch(() => complete(false))
            .finally(() => pendingAuth.delete(operation));
          pendingAuth.add(operation);
        });
        worker.postMessage({ type: "start", request, root: this.root });
        if (signal.aborted) stopped();
      });
      status.state = passed && !signal.aborted ? "passed" : "failed";
      if (signal.aborted) status.messages.push("Evaluation stopped. Completed attempts were kept.");
      else if (!passed)
        status.messages.push(
          "Evaluation did not fully pass. Inspect its report or Computer Cat's connection status.",
        );
    } catch {
      status.state = "failed";
      status.messages.push(
        "Evaluation worker failed. Re-run npm run eval:live to rebuild it; completed attempts were kept.",
      );
    } finally {
      if (stopped) signal.removeEventListener("abort", stopped);
      clearTimeout(stopTimer);
      clearTimeout(lifetime);
      // Keep a completed OAuth rotation in the app's sole credential store before quitting.
      await Promise.allSettled(pendingAuth);
      child?.kill();
      publish();
      await writes;
    }
  }

  async dispose() {
    this.closing = true;
    await this.accepting;
    this.active?.abort.abort();
    await this.active?.done;
  }
}
