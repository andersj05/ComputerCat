import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatController } from "../../src/main/chat-controller";
import { type Conversation, ConversationStore } from "../../src/main/conversation-store";
import { DEFAULT_MODEL_SETTINGS } from "../../src/shared/models";

describe("conversation lifecycle", () => {
  let directory: string;
  let store: ConversationStore;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "computercat-chat-history-"));
    store = new ConversationStore(directory);
  });
  afterEach(async () => {
    if (directory.startsWith(join(tmpdir(), "computercat-chat-history-")))
      await rm(directory, { recursive: true, force: true });
  });
  function setup() {
    const created: Conversation[] = [];
    const run = vi.fn(async (_prompt, _signal, delta) => {
      delta("Saved reply");
    });
    const controller = new ChatController(
      (record) => {
        created.push(record);
        return { run, dispose: () => {} };
      },
      () => {},
      { store, defaults: () => DEFAULT_MODEL_SETTINGS },
    );
    return { controller, created, run };
  }
  async function send(controller: ChatController, text: string) {
    expect(controller.send({ id: randomUUID(), text }).ok).toBe(true);
    await vi.waitFor(() => expect(controller.snapshot().busy).toBe(false));
  }
  it("creates separate histories, restores the model and context, and preserves chats across shutdown", async () => {
    const { controller, created } = setup();
    await send(controller, "first conversation");
    const first = controller.snapshot().conversationId;
    await controller.selectModel({ ...DEFAULT_MODEL_SETTINGS, source: "codex" });
    expect(controller.snapshot().conversationId).toBe(first);
    expect(created.at(-1)?.messages).toHaveLength(2);
    expect((await controller.clear()).ok).toBe(true);
    await send(controller, "second conversation");
    expect(controller.list()).toHaveLength(2);
    expect((await controller.open(first)).ok).toBe(true);
    expect(created.at(-1)?.model.source).toBe("codex");
    expect(controller.snapshot().messages[0]?.text).toBe("first conversation");
    await controller.dispose();
    const loaded = new ConversationStore(directory);
    await loaded.load();
    expect(loaded.list()).toHaveLength(2);
    expect(loaded.get(first ?? "")?.messages).toHaveLength(2);
  });
  it("does not invoke tools after a failed initial save and refuses to discard unsaved history", async () => {
    const { controller, run } = setup();
    const temporary = join(directory, `${controller.snapshot().conversationId}.json.tmp`);
    await mkdir(temporary);
    await send(controller, "keep this");
    expect(run).not.toHaveBeenCalled();
    expect(controller.snapshot().persistenceError).toContain("Couldn't save");
    expect((await controller.clear()).ok).toBe(false);
    expect(controller.snapshot().messages[0]?.text).toBe("keep this");
    await rmdir(temporary);
    expect((await controller.clear()).ok).toBe(true);
    expect(controller.list()).toHaveLength(1);
    await controller.dispose();
  });
  it("waits for deletion before shutdown so the deleted chat cannot be saved again", async () => {
    const { controller, created } = setup();
    await send(controller, "delete this chat");
    const id = controller.snapshot().conversationId;
    const before = created.length;
    expect((await controller.open(id)).ok).toBe(true);
    expect(created).toHaveLength(before + 1);
    let release: (() => void) | undefined;
    const original = store.delete.bind(store);
    vi.spyOn(store, "delete").mockImplementation(async (id) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await original(id);
    });
    const deletion = controller.delete(id);
    const shutdown = controller.dispose();
    release?.();
    expect((await deletion).ok).toBe(true);
    await shutdown;
    const reloaded = new ConversationStore(directory);
    await reloaded.load();
    expect(reloaded.list()).toEqual([]);
  });

  it("blocks history/model changes during tools and drops events after cancellation", async () => {
    let running = false;
    const controller = new ChatController(
      () => ({
        run: async (_prompt, signal, delta, tool) => {
          tool?.({ id: "1", name: "powershell", state: "running" });
          running = true;
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          delta("late output");
          tool?.({ id: "2", name: "write", state: "complete" });
        },
        dispose: () => {},
      }),
      () => {},
      { store, defaults: () => DEFAULT_MODEL_SETTINGS },
    );
    controller.send({ id: randomUUID(), text: "run" });
    await vi.waitFor(() => expect(running).toBe(true));
    expect((await controller.selectModel(DEFAULT_MODEL_SETTINGS)).ok).toBe(false);
    expect((await controller.open(randomUUID())).ok).toBe(false);
    await controller.dispose();
    const record = store.latest();
    expect(record?.messages[1]).toMatchObject({
      text: "",
      state: "stopped",
      tools: [{ id: "1", name: "powershell", state: "stopped" }],
    });
  });
});
