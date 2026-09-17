import type { AgentRuntime } from "../agent/runtime";
import { UserFacingError } from "../agent/runtime";
import type { ActionResult, ChatSnapshot } from "../shared/contracts";
import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from "../shared/models";
import { sendRequestSchema } from "../shared/validation";
import {
  type Conversation,
  type ConversationStore,
  conversationIdSchema,
  newConversation,
  recoverMessages,
} from "./conversation-store";

export class ChatController {
  private state: ChatSnapshot;
  private record: Conversation;
  private active: AbortController | undefined;
  private runtime: AgentRuntime;
  private disposed = false;
  private connectionInvalidated = false;
  private changing = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private turn: Promise<void> | undefined;

  constructor(
    private readonly createRuntime: (conversation: Conversation) => AgentRuntime,
    private readonly changed: (state: ChatSnapshot) => void,
    private readonly history?: { store: ConversationStore; defaults: () => ModelSettings },
  ) {
    this.record = history?.store.latest() ?? newConversation(this.defaults());
    this.state = { messages: this.record.messages, busy: false };
    if (history?.store.warning) this.state.persistenceError = history.store.warning;
    this.runtime = createRuntime(structuredClone(this.record));
  }

  private defaults(): ModelSettings {
    return this.history?.defaults() ?? DEFAULT_MODEL_SETTINGS;
  }

  snapshot(): ChatSnapshot {
    return structuredClone({
      ...this.state,
      busy: this.state.busy || this.changing,
      conversationId: this.record.id,
      title: this.record.title,
    });
  }
  list() {
    return this.history?.store.list() ?? [];
  }
  private publish(): void {
    if (!this.disposed) this.changed(this.snapshot());
  }

  private async save(): Promise<ActionResult> {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.history || !this.state.messages.length) return { ok: true };
    this.record.messages = this.state.messages;
    try {
      await this.history.store.save(this.record);
      delete this.state.persistenceError;
      return { ok: true };
    } catch {
      const message =
        "Couldn't save this conversation. Check available disk space and try again before switching chats.";
      this.state.persistenceError = message;
      this.publish();
      return { ok: false, message };
    }
  }
  private saveSoon(): void {
    if (!this.history || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      void this.save();
    }, 500);
  }
  private replace(record: Conversation): void {
    this.runtime.dispose();
    this.record = record;
    this.state = { messages: record.messages, busy: false };
    this.runtime = this.createRuntime(structuredClone(record));
    this.connectionInvalidated = false;
  }

  send(input: unknown): ActionResult {
    const parsed = sendRequestSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, message: "Enter a message between 1 and 6,000 characters." };
    if (this.disposed) return { ok: false, message: "The app is closing." };
    if (this.connectionInvalidated)
      return { ok: false, message: "Reconnect and choose a model, or start a new conversation." };
    if (this.state.busy || this.changing)
      return { ok: false, message: "Wait for the current reply or press Stop." };
    if (this.state.messages.length >= 1000)
      return { ok: false, message: "Start a new chat to continue." };
    if (this.state.messages.some((message) => message.id === parsed.data.id))
      return { ok: false, message: "That message has already been sent." };
    const { id, text } = parsed.data;
    if (!this.state.messages.length) this.record.title = text.replace(/\s+/g, " ").slice(0, 100);
    this.record.updatedAt = new Date().toISOString();
    this.state.messages.push(
      { id, role: "user", text, state: "complete" },
      { id: `${id}:reply`, role: "assistant", text: "", state: "streaming" },
    );
    const reply = this.state.messages[this.state.messages.length - 1];
    if (!reply) throw new Error("Reply state missing");
    const abort = new AbortController();
    this.active = abort;
    this.state.busy = true;
    this.publish();
    this.turn = (async () => {
      try {
        const persisted = this.history ? await this.save() : { ok: true as const };
        if (!persisted.ok) throw new UserFacingError(persisted.message);
        abort.signal.throwIfAborted();
        await this.runtime.run(
          text,
          abort.signal,
          (delta) => {
            if (abort.signal.aborted || this.disposed) return;
            if (reply.text.length + delta.length > 65536) {
              abort.abort();
              return;
            }
            reply.text += delta;
            this.publish();
            this.saveSoon();
          },
          (activity) => {
            if (abort.signal.aborted || this.disposed) return;
            reply.tools ??= [];
            const existing = reply.tools.find((tool) => tool.id === activity.id);
            if (existing) Object.assign(existing, activity);
            else if (reply.tools.length < 200) reply.tools.push(activity);
            this.publish();
            this.saveSoon();
          },
        );
        reply.state = abort.signal.aborted ? "stopped" : "complete";
      } catch (error) {
        reply.state = abort.signal.aborted ? "stopped" : "error";
        if (!abort.signal.aborted)
          reply.text =
            error instanceof UserFacingError
              ? error.message
              : "Something interrupted this reply. Please try again.";
      } finally {
        for (const tool of reply.tools ?? []) if (tool.state === "running") tool.state = "stopped";
        this.record.updatedAt = new Date().toISOString();
        await this.save();
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

  private async transition(action: () => Promise<ActionResult>): Promise<ActionResult> {
    if (this.disposed) return { ok: false, message: "The app is closing." };
    if (this.state.busy || this.changing)
      return {
        ok: false,
        message: "Stop the current reply before changing conversations or models.",
      };
    this.changing = true;
    this.publish();
    try {
      return await action();
    } catch {
      return { ok: false, message: "Couldn't change this conversation. Please try again." };
    } finally {
      this.changing = false;
      this.publish();
    }
  }

  clear(): Promise<ActionResult> {
    return this.transition(async () => {
      const result = await this.save();
      if (!result.ok) return result;
      this.replace(newConversation(this.defaults()));
      return { ok: true };
    });
  }

  open(input: unknown): Promise<ActionResult> {
    return this.transition(async () => {
      const id = conversationIdSchema.safeParse(input);
      if (!id.success) return { ok: false, message: "Choose a valid saved conversation." };
      if (id.data === this.record.id) return { ok: true };
      const record = this.history?.store.get(id.data);
      if (!record) return { ok: false, message: "That conversation is no longer available." };
      const result = await this.save();
      if (!result.ok) return result;
      this.replace(record);
      return { ok: true };
    });
  }

  delete(input: unknown): Promise<ActionResult> {
    return this.transition(async () => {
      const id = conversationIdSchema.safeParse(input);
      if (!id.success || !this.history?.store.get(id.data))
        return { ok: false, message: "Choose a saved conversation to delete." };
      const current = id.data === this.record.id;
      if (current) this.runtime.dispose();
      try {
        await this.history.store.delete(id.data);
      } catch {
        if (current) this.runtime = this.createRuntime(structuredClone(this.record));
        return { ok: false, message: "Couldn't delete this conversation. Please try again." };
      }
      if (current) this.replace(newConversation(this.defaults()));
      return { ok: true };
    });
  }

  selectModel(model: ModelSettings): Promise<ActionResult> {
    return this.transition(async () => {
      const next = { ...this.record, model: { ...model }, messages: this.state.messages };
      try {
        if (next.messages.length) await this.history?.store.save(next);
      } catch {
        return { ok: false, message: "Couldn't save the model change. Please try again." };
      }
      this.replace(next);
      return { ok: true };
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stop();
    await this.turn;
    this.runtime.dispose();
    this.state.messages = recoverMessages(this.state.messages);
    await this.save();
    await this.history?.store.flush();
  }

  invalidateConnection(): void {
    this.connectionInvalidated = true;
    this.stop();
    this.runtime.dispose();
  }
}
