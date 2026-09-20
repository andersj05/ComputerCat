import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workerEnvironment } from "../../src/agent/config";
import { createModelRuntime, createPiRuntime } from "../../src/agent/pi-runtime";
import { ALL_TOOL_NAMES, PI_TOOL_NAMES, WEB_TOOL_NAMES } from "../../src/shared/tools";

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
  it("exposes all built-in tools without discovering developer context", async () => {
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
        expect(context.tools?.map((tool) => tool.name).sort()).toEqual([...PI_TOOL_NAMES].sort());
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

  it("executes file tools through the real Pi loop and reports activity", async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    const directory = await mkdtemp(join(tmpdir(), "computercat-pi-tools-"));
    fixtureDirectories.push(directory);
    const models = await createModelRuntime();
    const provider = fauxProvider({ provider: "cat-tools", models: [{ id: "offline" }] });
    models.registerNativeProvider(provider.provider);
    provider.setResponses([
      fauxAssistantMessage(fauxToolCall("write", { path: "note.txt", content: "fixture one" }), {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage(
        fauxToolCall("edit", { path: "note.txt", oldText: "one", newText: "two" }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(fauxToolCall("read", { path: "note.txt" }), { stopReason: "toolUse" }),
      (context) => {
        expect(JSON.stringify(context.messages)).toContain("fixture two");
        return fauxAssistantMessage("Read and updated the fixture.");
      },
    ]);
    const runtime = await createPiRuntime(
      { provider: "cat-tools", model: "offline", apiKey: "" },
      directory,
      models,
    );
    const activity = vi.fn();
    try {
      await runtime.run("Update the fixture", new AbortController().signal, () => {}, activity);
      expect(await readFile(join(directory, "note.txt"), "utf8")).toBe("fixture two");
      expect(activity.mock.calls.map(([tool]) => [tool.name, tool.state])).toEqual([
        ["write", "running"],
        ["write", "complete"],
        ["edit", "running"],
        ["edit", "complete"],
        ["read", "running"],
        ["read", "complete"],
      ]);
    } finally {
      runtime.dispose();
    }
  });

  it("uses the desktop tools through Pi and preserves screenshots for the model", async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    const models = await createModelRuntime();
    const sourceId = "b62ef1cb-80e5-4fe5-b1aa-c3b2ec78214c";
    const pixels = "c2NyZWVuc2hvdC1maXh0dXJl";
    const content = [
      {
        type: "text",
        text: JSON.stringify({
          sourceId,
          title: "Fixture window",
          window: { text: "A useful page", selectedText: "useful", tabs: ["Notes"] },
        }),
      },
      { type: "image", mimeType: "image/png", data: pixels },
    ];
    const desktop = vi.fn().mockResolvedValue({ content });
    const provider = fauxProvider({
      provider: "cat-desktop",
      models: [{ id: "vision", input: ["text", "image"] }],
    });
    models.registerNativeProvider(provider.provider);
    provider.setResponses([
      (context) => {
        expect(context.tools?.map((tool) => tool.name).sort()).toEqual(
          ALL_TOOL_NAMES.filter(
            (name) => !(WEB_TOOL_NAMES as readonly string[]).includes(name),
          ).sort(),
        );
        expect(context.systemPrompt).toContain(
          "call desktop_observe without asking them to share a screen",
        );
        expect(context.systemPrompt).toContain("untrusted data");
        return fauxAssistantMessage(fauxToolCall("desktop_observe", {}), {
          stopReason: "toolUse",
        });
      },
      (context) => {
        const result = context.messages.findLast((message) => message.role === "toolResult");
        expect(result?.content).toEqual(content);
        return fauxAssistantMessage("The fixture window is visible.");
      },
    ]);
    const runtime = await createPiRuntime(
      { provider: "cat-desktop", model: "vision", apiKey: "" },
      process.cwd(),
      models,
      undefined,
      desktop,
    );
    const activity = vi.fn();
    try {
      await runtime.run("What is this page?", new AbortController().signal, () => {}, activity);
      expect(desktop.mock.calls.map(([request]) => request)).toEqual([
        { operation: "observe", screenshot: true },
      ]);
      expect(activity.mock.calls.map(([tool]) => [tool.name, tool.state])).toEqual([
        ["desktop_observe", "running"],
        ["desktop_observe", "complete"],
      ]);
      expect(JSON.stringify(activity.mock.calls)).not.toContain(pixels);
      expect(JSON.stringify(activity.mock.calls)).not.toContain("Fixture window");
    } finally {
      runtime.dispose();
    }
  });

  it("returns a locked desktop to the model as an error without failing the whole turn", async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    const models = await createModelRuntime();
    const provider = fauxProvider({ provider: "cat-desktop-denial", models: [{ id: "offline" }] });
    models.registerNativeProvider(provider.provider);
    provider.setResponses([
      fauxAssistantMessage(fauxToolCall("desktop_observe", {}), { stopReason: "toolUse" }),
      (context) => {
        const result = context.messages.findLast((message) => message.role === "toolResult");
        expect(result?.role === "toolResult" && result.isError).toBe(true);
        expect(result?.content).toEqual([{ type: "text", text: "The desktop is locked." }]);
        return fauxAssistantMessage("Windows is locked, so I cannot see the page yet.");
      },
    ]);
    const runtime = await createPiRuntime(
      { provider: "cat-desktop-denial", model: "offline", apiKey: "" },
      process.cwd(),
      models,
      undefined,
      async () => ({ content: [{ type: "text", text: "The desktop is locked." }], isError: true }),
    );
    const activity = vi.fn();
    try {
      await runtime.run("Describe my screen", new AbortController().signal, () => {}, activity);
      expect(activity.mock.calls.at(-1)?.[0]).toMatchObject({
        name: "desktop_observe",
        state: "error",
      });
    } finally {
      runtime.dispose();
    }
  });

  it("restores native context including tool results and honors a new model", async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    const directory = await mkdtemp(join(tmpdir(), "computercat-pi-restore-"));
    fixtureDirectories.push(directory);
    await writeFile(join(directory, "fact.txt"), "native-tool-result-canary");
    const models = await createModelRuntime();
    const provider = fauxProvider({
      provider: "cat-restore",
      models: [{ id: "one" }, { id: "two" }],
    });
    models.registerNativeProvider(provider.provider);
    provider.setResponses([
      fauxAssistantMessage(fauxToolCall("read", { path: "fact.txt" }), { stopReason: "toolUse" }),
      fauxAssistantMessage("The fixture is read."),
      (context, _options, _state, model) => {
        expect(model.id).toBe("two");
        expect(JSON.stringify(context.messages)).toContain("native-tool-result-canary");
        expect(JSON.stringify(context.messages)).toContain("demo-gap-canary");
        expect(
          context.messages.filter(
            (m) => m.role === "user" && JSON.stringify(m.content).includes("Read fact.txt"),
          ),
        ).toHaveLength(1);
        return fauxAssistantMessage("Restored.");
      },
    ]);
    const saved = { sessionFile: join(directory, "session.jsonl"), history: [] };
    const first = await createPiRuntime(
      { provider: "cat-restore", model: "one", apiKey: "fixture-secret" },
      directory,
      models,
      saved,
    );
    await first.run("Read fact.txt", new AbortController().signal, () => {});
    first.dispose();
    const second = await createPiRuntime(
      { provider: "cat-restore", model: "two", apiKey: "fixture-secret" },
      directory,
      models,
      {
        ...saved,
        history: [
          { id: "1", role: "user", text: "Read fact.txt", state: "complete" },
          { id: "2", role: "assistant", text: "The fixture is read.", state: "complete" },
          { id: "3", role: "user", text: "demo-gap-canary", state: "complete" },
          { id: "4", role: "assistant", text: "Demo response", state: "complete" },
        ],
      },
    );
    try {
      await second.run("Continue", new AbortController().signal, () => {});
      expect(await readFile(saved.sessionFile, "utf8")).not.toContain("fixture-secret");
    } finally {
      second.dispose();
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
      COMPUTERCAT_BRAVE_SEARCH_API_KEY: "main-only-search-secret",
    });
    expect(env).toEqual({
      PI_OFFLINE: "1",
      NO_COLOR: "1",
      PATH: "system-path",
    });
  });
});
