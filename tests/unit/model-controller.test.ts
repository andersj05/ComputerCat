import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../src/agent/config";
import { ModelController } from "../../src/main/model-controller";
import { ModelSettingsStore } from "../../src/main/model-settings";
import { DEFAULT_MODEL_SETTINGS } from "../../src/shared/models";

describe("model selection and conversation isolation", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "computercat-selection-"));
  });
  afterEach(async () => {
    if (directory.startsWith(join(tmpdir(), "computercat-selection-")))
      await rm(directory, { recursive: true, force: true });
  });
  function setup() {
    let connected = true;
    const codex = {
      catalog: () => [
        { id: "gpt-5.6-sol", name: "Sol", reasoning: ["medium" as const, "high" as const] },
        { id: "another-model", name: "Another", reasoning: ["medium" as const] },
      ],
      snapshot: () => ({ connected, storageAvailable: true, login: null, message: null }),
      accessToken: vi.fn(async () => {
        if (!connected) throw new Error("Disconnected");
        return "test-access";
      }),
    };
    const requests: RuntimeConfig[] = [];
    const settings = new ModelSettingsStore(join(directory, "models.json"), DEFAULT_MODEL_SETTINGS);
    const changed = vi.fn();
    const controller = new ModelController(
      settings,
      codex,
      { mode: "demo", provider: "", model: "", apiKey: "" },
      (getConfig) => ({
        run: async (_prompt, signal) => {
          requests.push(await getConfig(signal));
        },
        dispose: () => {},
      }),
      changed,
    );
    return {
      controller,
      codex,
      settings,
      requests,
      setConnected: (value: boolean) => {
        connected = value;
      },
    };
  }

  it("validates catalogue membership, reasoning, connection availability, and unknown fields", async () => {
    const { controller, setConnected } = setup();
    for (const patch of [
      { ...DEFAULT_MODEL_SETTINGS, source: "codex", codexModel: "invented" },
      { ...DEFAULT_MODEL_SETTINGS, source: "codex", reasoning: "max" },
      { ...DEFAULT_MODEL_SETTINGS, source: "environment" },
      { ...DEFAULT_MODEL_SETTINGS, secret: "injected" },
    ])
      expect((await controller.update(patch)).ok).toBe(false);
    setConnected(false);
    expect((await controller.update({ ...DEFAULT_MODEL_SETTINGS, source: "codex" })).ok).toBe(
      false,
    );
    expect(controller.snapshot().defaults).toEqual(DEFAULT_MODEL_SETTINGS);
  });

  it("keeps the current model and context until a new conversation and resolves auth for each turn", async () => {
    const { controller, requests, codex } = setup();
    await controller.update({ ...DEFAULT_MODEL_SETTINGS, source: "codex" });
    const old = controller.createRuntime();
    await controller.update({
      ...DEFAULT_MODEL_SETTINGS,
      source: "codex",
      codexModel: "another-model",
    });
    expect(controller.snapshot().active.codexModel).toBe("gpt-5.6-sol");
    const signal = new AbortController().signal;
    await old.run("first", signal, () => {});
    codex.accessToken.mockResolvedValueOnce("rotated-access");
    await old.run("follow-up", signal, () => {});
    const next = controller.createRuntime();
    await next.run("new chat", signal, () => {});
    expect(requests.map((request) => request.model)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-sol",
      "another-model",
    ]);
    expect(requests[1]?.apiKey).toBe("rotated-access");
    expect(JSON.stringify(controller.snapshot())).not.toContain("access");
  });

  it("fails closed for obsolete saved models and allows returning to demo while disconnected", async () => {
    const { controller, settings, codex, setConnected } = setup();
    await settings.update({
      ...DEFAULT_MODEL_SETTINGS,
      source: "codex",
      codexModel: "removed-model",
    });
    const runtime = controller.createRuntime();
    await expect(runtime.run("hi", new AbortController().signal, () => {})).rejects.toThrow(
      "unavailable",
    );
    expect(codex.accessToken).not.toHaveBeenCalled();
    setConnected(false);
    expect(await controller.update(DEFAULT_MODEL_SETTINGS)).toEqual({ ok: true });
    controller.createRuntime();
    expect(controller.snapshot().active.source).toBe("demo");
  });
});
