import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type WorkerEvent, workerRequestSchema } from "./protocol";
import { type AgentRuntime, UserFacingError } from "./runtime";

const port = process.parentPort;
if (!port) throw new Error("The agent must run as an Electron utility process.");
let runtime: AgentRuntime | undefined;
let models: ModelRuntime | undefined;
let sessionKey: string | undefined;
let active: { id: string; abort: AbortController } | undefined;
const send = (event: WorkerEvent) => port.postMessage(event);

port.on("message", async ({ data }) => {
  const parsed = workerRequestSchema.safeParse(data);
  if (!parsed.success) return;
  const request = parsed.data;
  if (request.type === "stop") {
    if (active?.id === request.id) active.abort.abort();
    return;
  }
  if (active) {
    send({ type: "error", id: request.id, message: "Please wait for the current reply." });
    return;
  }
  const current = { id: request.id, abort: new AbortController() };
  active = current;
  try {
    const config = request.config;
    const key = JSON.stringify([config.provider, config.model, config.reasoning]);
    if (sessionKey && sessionKey !== key)
      throw new UserFacingError("Start a new conversation to change models.");
    const { createModelRuntime, createPiRuntime } = await import("./pi-runtime");
    models ??= await createModelRuntime();
    // Resolve in main for every turn so a long-running worker cannot reuse an expired token.
    if (runtime) await models.setRuntimeApiKey(config.provider, config.apiKey);
    runtime ??= await createPiRuntime(config, process.cwd(), models, request.context);
    sessionKey = key;
    current.abort.signal.throwIfAborted();
    await runtime.run(
      request.prompt,
      current.abort.signal,
      (text) => {
        send({ type: "delta", id: request.id, text });
      },
      (activity) => {
        send({ type: "tool", id: request.id, activity });
      },
    );
    send({ type: "done", id: request.id });
  } catch (error) {
    if (current.abort.signal.aborted) send({ type: "done", id: request.id });
    else
      send({
        type: "error",
        id: request.id,
        message:
          error instanceof UserFacingError
            ? error.message
            : "The model connection failed. Check your configuration and try again.",
      });
  } finally {
    active = undefined;
  }
});
