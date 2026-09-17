import type { AgentRuntime } from "../agent/runtime";
import { UserFacingError } from "../agent/runtime";
import type { ActionResult, ChatSnapshot } from "../shared/contracts";
import { sendRequestSchema } from "../shared/validation";

export class ChatController {
  private state: ChatSnapshot = { messages: [], busy: false };
  private active: AbortController | undefined;
  private runtime: AgentRuntime;
  private disposed = false;
  private connectionInvalidated = false;

  constructor(
    private readonly createRuntime: () => AgentRuntime,
    private readonly changed: (state: ChatSnapshot) => void,
  ) {
    this.runtime = createRuntime();
  }

  snapshot(): ChatSnapshot {
    return structuredClone(this.state);
  }

  private publish(): void {
    if (!this.disposed) this.changed(this.snapshot());
  }

  send(input: unknown): ActionResult {
    const parsed = sendRequestSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, message: "Enter a message between 1 and 6,000 characters." };
    if (this.disposed) return { ok: false, message: "The app is closing." };
    if (this.connectionInvalidated)
      return {
        ok: false,
        message: "Start a new conversation after reconnecting or changing the default connection.",
      };
    if (this.state.busy) return { ok: false, message: "Wait for the current reply or press Stop." };
    if (this.state.messages.length >= 80)
      return { ok: false, message: "Start a new chat to continue." };
    if (this.state.messages.some((message) => message.id === parsed.data.id))
      return { ok: false, message: "That message has already been sent." };
    const { id, text } = parsed.data;
    const assistant = {
      id: `${id}:reply`,
      role: "assistant" as const,
      text: "",
      state: "streaming" as const,
    };
    this.state.messages.push({ id, role: "user", text, state: "complete" }, assistant);
    const reply = this.state.messages[this.state.messages.length - 1];
    if (!reply) throw new Error("Reply state missing");
    const abort = new AbortController();
    this.active = abort;
    this.state.busy = true;
    this.publish();
    void (async () => {
      try {
        await this.runtime.run(text, abort.signal, (delta) => {
          if (abort.signal.aborted || this.disposed) return;
          if (reply.text.length + delta.length > 65536) {
            abort.abort();
            return;
          }
          reply.text += delta;
          this.publish();
        });
        reply.state = abort.signal.aborted ? "stopped" : "complete";
      } catch (error) {
        reply.state = abort.signal.aborted ? "stopped" : "error";
        if (!abort.signal.aborted)
          reply.text =
            error instanceof UserFacingError
              ? error.message
              : "Something interrupted this reply. Please try again.";
      } finally {
        this.state.busy = false;
        this.active = undefined;
        this.publish();
      }
    })();
    return { ok: true };
  }

  stop(): void {
    this.active?.abort();
  }

  clear(): ActionResult {
    if (this.state.busy)
      return { ok: false, message: "Stop the current reply before starting a new chat." };
    this.runtime.dispose();
    this.runtime = this.createRuntime();
    this.connectionInvalidated = false;
    this.state = { messages: [], busy: false };
    this.publish();
    return { ok: true };
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.runtime.dispose();
  }

  invalidateConnection(): void {
    this.connectionInvalidated = true;
    this.stop();
    this.runtime.dispose();
  }
}
