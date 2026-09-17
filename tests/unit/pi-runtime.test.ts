import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workerEnvironment } from "../../src/agent/config";
import { createModelRuntime, createPiRuntime } from "../../src/agent/pi-runtime";

const fixtureDirectories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of fixtureDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Pi integration without network or credentials", () => {
  it("accepts only the parent's resolved Codex access token and supports rotation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unrelated-secret");
    const models = await createModelRuntime();
    expect(await models.getAuth("openai-codex")).toBeUndefined();
    await models.setRuntimeApiKey("openai-codex", "parent-access-token");
    expect((await models.getAuth("openai-codex"))?.auth.apiKey).toBe("parent-access-token");
    await models.setRuntimeApiKey("openai-codex", "rotated-access-token");
    expect((await models.getAuth("openai-codex"))?.auth.apiKey).toBe("rotated-access-token");
    expect(models.getRegisteredNativeProvider("openai-codex")?.auth.oauth).toBeUndefined();
  });
  it("runs the real SDK with a local provider and no tools or discovered context", async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    const directory = await mkdtemp(join(tmpdir(), "computercat-pi-context-"));
    fixtureDirectories.push(directory);
    const canary = "developer-memory-canary-must-not-reach-the-model";
    for (const filename of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "MEMORY.md"]) {
      await writeFile(join(directory, filename), canary, "utf8");
    }
    const models = await createModelRuntime();
    const provider = fauxProvider({ provider: "cat-test", models: [{ id: "offline" }] });
    models.registerNativeProvider(provider.provider);
    provider.setResponses([
      (context) => {
        expect(context.tools ?? []).toHaveLength(0);
        expect(context.systemPrompt).toContain("You are Computer Cat");
        expect(context.systemPrompt).not.toContain("GitHub authentication");
        expect(JSON.stringify(context)).not.toContain(canary);
        return fauxAssistantMessage("Hello from the real Pi loop.");
      },
    ]);
    const runtime = await createPiRuntime(
      { provider: "cat-test", model: "offline", apiKey: "" },
      directory,
      models,
    );
    let response = "";
    try {
      await runtime.run("Hello", new AbortController().signal, (text) => {
        response += text;
      });
      expect(response).toBe("Hello from the real Pi loop.");
      expect(provider.state.callCount).toBe(1);
    } finally {
      runtime.dispose();
    }
  });

  it("retains context within a runtime but starts a replacement runtime with a fresh session", async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    const models = await createModelRuntime();
    const provider = fauxProvider({ provider: "cat-memory-test", models: [{ id: "offline" }] });
    models.registerNativeProvider(provider.provider);
    provider.setResponses([
      fauxAssistantMessage("first-runtime-reply-canary"),
      (context) => {
        expect(JSON.stringify(context.messages)).toContain("first-runtime-prompt-canary");
        expect(JSON.stringify(context.messages)).toContain("first-runtime-reply-canary");
        return fauxAssistantMessage("The same session retains context.");
      },
      (context) => {
        expect(JSON.stringify(context.messages)).not.toContain("first-runtime-");
        expect(JSON.stringify(context.messages)).toContain("replacement-runtime-prompt");
        return fauxAssistantMessage("The replacement session is fresh.");
      },
    ]);
    const config = { provider: "cat-memory-test", model: "offline", apiKey: "" };
    const first = await createPiRuntime(config, process.cwd(), models);
    try {
      await first.run("first-runtime-prompt-canary", new AbortController().signal, () => {});
      await first.run("Follow up", new AbortController().signal, () => {});
    } finally {
      first.dispose();
    }
    const replacement = await createPiRuntime(config, process.cwd(), models);
    try {
      await replacement.run("replacement-runtime-prompt", new AbortController().signal, () => {});
      expect(provider.state.callCount).toBe(3);
    } finally {
      replacement.dispose();
    }
  });

  it("only forwards explicit worker configuration and necessary OS variables", () => {
    const env = workerEnvironment({
      PATH: "system-path",
      OPENAI_API_KEY: "unrelated-secret",
      NODE_OPTIONS: "--require bad.js",
      COMPUTERCAT_API_KEY: "chosen-secret",
    });
    expect(env).toEqual({
      PI_OFFLINE: "1",
      NO_COLOR: "1",
      PATH: "system-path",
    });
  });
});
