import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ChatMessage } from "../shared/contracts";
import type { ModelSettings } from "../shared/models";
import { PI_TOOL_NAMES } from "../shared/tools";
import { modelSettingsSchema } from "../shared/validation";

export const conversationIdSchema = z.uuid();
const MAX_RECORD_BYTES = 32 * 1024 * 1024;
const messageSchema = z.strictObject({
  id: z.string().min(1).max(256),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(65536),
  state: z.enum(["complete", "streaming", "stopped", "error"]),
  tools: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(256),
        name: z.enum(PI_TOOL_NAMES),
        state: z.enum(["running", "complete", "error", "stopped"]),
      }),
    )
    .max(200)
    .optional(),
});
const conversationSchema = z.strictObject({
  version: z.literal(1),
  id: conversationIdSchema,
  title: z.string().max(120),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  model: modelSettingsSchema,
  messages: z.array(messageSchema).max(1000),
});
export type Conversation = z.infer<typeof conversationSchema>;

export function newConversation(model: ModelSettings): Conversation {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: randomUUID(),
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    model: { ...model },
    messages: [],
  };
}

export function recoverMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    state: message.state === "streaming" ? "stopped" : message.state,
    ...(message.tools
      ? {
          tools: message.tools.map((tool) => ({
            ...tool,
            state: tool.state === "running" ? ("stopped" as const) : tool.state,
          })),
        }
      : {}),
  }));
}

// Only validated UUIDs choose paths. Renderer callers never supply filesystem paths.
export class ConversationStore {
  private records = new Map<string, Conversation>();
  private pending: Promise<void> = Promise.resolve();
  warning: string | undefined;
  constructor(private readonly directory: string) {}

  async load(): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        this.warning = "Couldn't read saved conversations. Your files have not been changed.";
      return;
    }
    for (const name of names) {
      if (!name.endsWith(".json") || !conversationIdSchema.safeParse(name.slice(0, -5)).success)
        continue;
      try {
        const file = join(this.directory, name);
        if ((await stat(file)).size > MAX_RECORD_BYTES) throw new Error("Oversized conversation");
        const record = conversationSchema.parse(JSON.parse(await readFile(file, "utf8")));
        if (name !== `${record.id}.json`) throw new Error("Mismatched conversation");
        record.messages = recoverMessages(record.messages);
        this.records.set(record.id, record);
      } catch {
        this.warning = "Some saved conversations couldn't be read. Their files have been kept.";
      }
    }
  }

  list() {
    return [...this.records.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, title, createdAt, updatedAt, model, messages }) => ({
        id,
        title,
        createdAt,
        updatedAt,
        model: { ...model },
        messageCount: messages.length,
      }));
  }
  get(id: string): Conversation | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
  latest(): Conversation | undefined {
    const id = this.list()[0]?.id;
    return id ? this.get(id) : undefined;
  }
  sessionFile(id: string): string {
    return join(this.directory, `${conversationIdSchema.parse(id)}.pi.jsonl`);
  }
  save(record: Conversation): Promise<void> {
    const copy = conversationSchema.parse(structuredClone(record));
    const serialized = JSON.stringify(copy);
    if (Buffer.byteLength(serialized, "utf8") > MAX_RECORD_BYTES)
      return Promise.reject(new Error("Conversation exceeds the storage limit"));
    const operation = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const target = join(this.directory, `${copy.id}.json`);
      await writeFile(`${target}.tmp`, serialized, { encoding: "utf8", mode: 0o600 });
      await rename(`${target}.tmp`, target);
      this.records.set(copy.id, copy);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
  delete(id: string): Promise<void> {
    conversationIdSchema.parse(id);
    const operation = this.pending.then(async () => {
      // Remove private Pi context before the display record, so a failed delete can be retried.
      await rm(this.sessionFile(id), { force: true });
      await rm(join(this.directory, `${id}.json`), { force: true });
      await rm(join(this.directory, `${id}.json.tmp`), { force: true });
      this.records.delete(id);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
  flush(): Promise<void> {
    return this.pending;
  }
}
