import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelSettingsStore } from "../../src/main/model-settings";
import { DEFAULT_MODEL_SETTINGS } from "../../src/shared/models";

describe("saved default model", () => {
  let directory: string;
  let path: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "computercat-models-"));
    path = join(directory, "models.json");
  });
  afterEach(async () => {
    if (directory.startsWith(join(tmpdir(), "computercat-models-")))
      await rm(directory, { recursive: true, force: true });
  });
  it("validates full updates, preserves defaults after corruption, and restores saved choices", async () => {
    await writeFile(path, "bad json");
    const store = new ModelSettingsStore(path, DEFAULT_MODEL_SETTINGS);
    await store.load();
    expect(store.snapshot()).toEqual(DEFAULT_MODEL_SETTINGS);
    for (const invalid of [
      {},
      { ...DEFAULT_MODEL_SETTINGS, source: "shell" },
      { ...DEFAULT_MODEL_SETTINGS, apiKey: "secret" },
    ])
      expect((await store.update(invalid)).ok).toBe(false);
    const next = {
      ...DEFAULT_MODEL_SETTINGS,
      source: "codex" as const,
      codexModel: "chosen-model",
    };
    expect(await store.update(next)).toEqual({ ok: true });
    const restored = new ModelSettingsStore(path, DEFAULT_MODEL_SETTINGS);
    await restored.load();
    expect(restored.snapshot()).toEqual(next);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(next);
  });
  it("does not change the running preference on a save failure", async () => {
    const store = new ModelSettingsStore(path, DEFAULT_MODEL_SETTINGS);
    await mkdir(`${path}.tmp`);
    const result = await store.update({ ...DEFAULT_MODEL_SETTINGS, source: "codex" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(directory);
    expect(store.snapshot()).toEqual(DEFAULT_MODEL_SETTINGS);
  });
});
