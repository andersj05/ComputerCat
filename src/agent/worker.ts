import { isConfigured, readRuntimeConfig } from "./config";
import { type WorkerEvent, workerRequestSchema } from "./protocol";
import { type AgentRuntime, UserFacingError } from "./runtime";

const port = process.parentPort;
if (!port) throw new Error("The agent must run as an Electron utility process.");
let runtime: AgentRuntime | undefined;
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
    const config = readRuntimeConfig(process.env);
    if (!isConfigured(config))
      throw new UserFacingError(
        "A model isn't connected yet. Configure your provider, model, and key, or restart in demo mode.",
      );
    const { createPiRuntime } = await import("./pi-runtime");
    runtime ??= await createPiRuntime(config, process.cwd());
    current.abort.signal.throwIfAborted();
    await runtime.run(request.prompt, current.abort.signal, (text) => {
      send({ type: "delta", id: request.id, text });
    });
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
