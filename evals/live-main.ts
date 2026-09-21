import { randomUUID } from "node:crypto";
import { z } from "zod";
import { evaluationRequestSchema } from "../src/shared/evaluations";
import { runLiveBatch } from "./live-batch";

const port = process.parentPort;
if (!port || process.env.COMPUTERCAT_LIVE_EVAL !== "1" || process.env.CI)
  throw new Error("Evaluations must be launched by Computer Cat's development host.");
const abort = new AbortController();
let started = false;
let pending:
  | { id: string; resolve: (token: string) => void; reject: (error: Error) => void }
  | undefined;
const requestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("start"),
    request: evaluationRequestSchema,
    root: z.string().min(1),
  }),
  z.strictObject({ type: z.literal("cancel") }),
  z.strictObject({ type: z.literal("token"), id: z.uuid(), token: z.string().min(1).max(32768) }),
]);
port.on("message", ({ data }) => {
  const parsed = requestSchema.safeParse(data);
  if (!parsed.success) {
    abort.abort();
    return;
  }
  const event = parsed.data;
  if (event.type === "cancel") {
    abort.abort();
    pending?.reject(new Error("Evaluation stopped."));
    pending = undefined;
    return;
  }
  if (event.type === "token") {
    if (pending?.id === event.id) {
      pending.resolve(event.token);
      pending = undefined;
    }
    return;
  }
  if (started || event.request.action !== "run") return;
  started = true;
  const accessToken = async (signal: AbortSignal): Promise<string> => {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      pending = { id, resolve, reject };
      port.postMessage({ type: "token-request", id });
    });
  };
  void runLiveBatch(event.request, event.root, { accessToken }, abort.signal, (message) =>
    port.postMessage({ type: "progress", message }),
  )
    .then((passed) => port.postMessage({ type: "finished", passed }))
    .catch(() => port.postMessage({ type: "error" }));
});
