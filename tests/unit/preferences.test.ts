import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PreferencesStore } from "../../src/main/preferences";
import { DEFAULT_PREFERENCES } from "../../src/shared/contracts";

describe("companion preference boundary", () => {
  let directory: string;
  let path: string;
  let store: PreferencesStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "computercat-preferences-"));
    path = join(directory, "preferences.json");
    store = new PreferencesStore(path);
    await store.load();
  });

  afterEach(async () => {
    if (!directory.startsWith(join(tmpdir(), "computercat-preferences-")))
      throw new Error("Unexpected test directory");
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects invalid and unexpected fields without changing defaults", async () => {
    for (const patch of [
      null,
      {},
      { size: "huge" },
      { alwaysOnTop: "true" },
      { animation: undefined },
      { size: "small", tool: "shell" },
    ]) {
      expect((await store.update(patch)).ok).toBe(false);
    }
    const snapshot = store.snapshot();
    snapshot.size = "large";
    expect(store.snapshot()).toEqual(DEFAULT_PREFERENCES);
  });

  it("serializes partial updates and restores saved preferences", async () => {
    const results = await Promise.all([
      store.update({ size: "small" }),
      store.update({ animation: false }),
      store.update({ alwaysOnTop: false }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const restored = new PreferencesStore(path);
    await restored.load();
    expect(restored.snapshot()).toEqual({ size: "small", animation: false, alwaysOnTop: false });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(restored.snapshot());
  });

  it("recovers safely from a corrupt or unrecognized file", async () => {
    for (const content of [
      "broken json",
      JSON.stringify({ ...DEFAULT_PREFERENCES, extra: true }),
    ]) {
      await writeFile(path, content);
      const restored = new PreferencesStore(path);
      await restored.load();
      expect(restored.snapshot()).toEqual(DEFAULT_PREFERENCES);
    }
  });

  it("keeps current settings and hides path details when saving fails", async () => {
    await writeFile(join(directory, "not-a-directory"), "file");
    const blocked = new PreferencesStore(join(directory, "not-a-directory", "preferences.json"));
    const result = await blocked.update({ size: "large" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(directory);
    expect(blocked.snapshot()).toEqual(DEFAULT_PREFERENCES);
  });
});
