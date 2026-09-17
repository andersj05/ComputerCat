import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConversationStore, newConversation } from "../../src/main/conversation-store";
import { DEFAULT_MODEL_SETTINGS } from "../../src/shared/models";

describe("saved conversations", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "computercat-history-"));
  });
  afterEach(async () => {
    if (directory.startsWith(join(tmpdir(), "computercat-history-")))
      await rm(directory, { recursive: true, force: true });
  });
  it("restores transcripts and model choices, preserving order and stopping interrupted work", async () => {
    const store = new ConversationStore(directory);
    const record = newConversation({ ...DEFAULT_MODEL_SETTINGS, source: "codex" });
    record.messages = [
      {
        id: "one",
        role: "assistant",
        text: "partial",
        state: "streaming",
        tools: [{ id: "tool", name: "read", state: "running" }],
      },
    ];
    await store.save(record);
    const loaded = new ConversationStore(directory);
    await loaded.load();
    expect(loaded.latest()?.model.source).toBe("codex");
    expect(loaded.latest()?.messages[0]).toMatchObject({
      text: "partial",
      state: "stopped",
      tools: [{ name: "read", state: "stopped" }],
    });
    expect(loaded.list()[0]?.messageCount).toBe(1);
    const detached = loaded.get(record.id);
    if (detached) detached.messages.length = 0;
    expect(loaded.get(record.id)?.messages).toHaveLength(1);
  });
  it("retains the previous committed transcript on save failure and permits retry", async () => {
    const store = new ConversationStore(directory);
    const record = newConversation(DEFAULT_MODEL_SETTINGS);
    await store.save(record);
    const temporary = join(directory, `${record.id}.json.tmp`);
    await mkdir(temporary);
    record.title = "changed";
    await expect(store.save(record)).rejects.toThrow();
    expect(store.get(record.id)?.title).toBe("New conversation");
    await rmdir(temporary);
    await store.save(record);
    expect(store.get(record.id)?.title).toBe("changed");
  });
  it("skips corrupt metadata without modifying it and rejects path traversal", async () => {
    const store = new ConversationStore(directory);
    const record = newConversation(DEFAULT_MODEL_SETTINGS);
    const file = join(directory, `${record.id}.json`);
    await writeFile(file, "broken");
    await store.load();
    expect(store.warning).toContain("kept");
    expect(await readFile(file, "utf8")).toBe("broken");
    expect(() => store.sessionFile("../outside")).toThrow();
    expect(() => store.delete("../outside")).toThrow();
    expect(store.list()).toEqual([]);
  });
  it("deletes both the transcript and native Pi context without touching other sessions", async () => {
    const store = new ConversationStore(directory);
    const first = newConversation(DEFAULT_MODEL_SETTINGS);
    const second = newConversation(DEFAULT_MODEL_SETTINGS);
    await store.save(first);
    await store.save(second);
    await writeFile(store.sessionFile(first.id), "private tool results");
    await store.delete(first.id);
    await expect(readFile(store.sessionFile(first.id))).rejects.toThrow();
    expect(store.list().map((record) => record.id)).toEqual([second.id]);
    const loaded = new ConversationStore(directory);
    await loaded.load();
    expect(loaded.list()).toHaveLength(1);
  });
});
