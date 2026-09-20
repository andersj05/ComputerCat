import { randomUUID } from "node:crypto";
import type { WebExecutor, WebResult } from "../shared/web";
import type { WorkerEvent, WorkerRequest } from "./protocol";

type WebReply = Extract<WorkerRequest, { type: "web-result" }>;
type Pending = {
  turnId: string;
  finish: (result?: WebResult) => void;
};

/** Private worker-to-main web calls, scoped to the currently running turn. */
export class WebWorkerClient {
  private active: { id: string; signal: AbortSignal } | undefined;
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly send: (event: WorkerEvent) => void,
    private readonly timeoutMs = 20_000,
  ) {}

  beginTurn(id: string, signal: AbortSignal): void {
    this.endTurn();
    this.active = { id, signal };
  }

  endTurn(): void {
    this.active = undefined;
    for (const call of this.pending.values()) call.finish();
  }

  readonly execute: WebExecutor = (request, signal) => {
    const turn = this.active;
    signal.throwIfAborted();
    if (!turn || turn.signal.aborted)
      return Promise.reject(new Error("There is no active web tool turn."));
    if (this.pending.size >= 4)
      return Promise.reject(new Error("Too many web requests are pending."));
    const cancellation = AbortSignal.any([signal, turn.signal]);
    const callId = randomUUID();
    return new Promise<WebResult>((resolve, reject) => {
      const finish = (result?: WebResult) => {
        if (!this.pending.delete(callId)) return;
        clearTimeout(timeout);
        cancellation.removeEventListener("abort", abort);
        if (result && !cancellation.aborted) resolve(result);
        else reject(new Error("The web request ended before a result arrived."));
      };
      const abort = () => finish();
      const timeout = setTimeout(abort, this.timeoutMs);
      timeout.unref?.();
      this.pending.set(callId, { turnId: turn.id, finish });
      cancellation.addEventListener("abort", abort, { once: true });
      try {
        this.send({ type: "web-request", id: turn.id, callId, request });
      } catch {
        finish();
      }
    });
  };

  receive(reply: WebReply): boolean {
    const call = this.pending.get(reply.callId);
    if (!call || call.turnId !== reply.id || this.active?.id !== reply.id) return false;
    call.finish(reply.result);
    return true;
  }
}
