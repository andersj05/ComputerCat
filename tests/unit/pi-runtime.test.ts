import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workerEnvironment } from "../../src/agent/config";
import { createModelRuntime, createPiRuntime } from "../../src/agent/pi-runtime";

afterEach(() => vi.unstubAllEnvs());

describe("Pi integration without network or credentials", () => {
  it("runs the real SDK with a local provider and no tools or discovered context", async () => {
    vi.stubEnv("PI_OFFLINE", "1");
    const models = await createModelRuntime();
    const provider = fauxProvider({ provider: "cat-test", models: [{ id: "offline" }] });
    models.registerNativeProvider(provider.provider);
    provider.setResponses([
      (context) => {
        expect(context.tools ?? []).toHaveLength(0);
        expect(context.systemPrompt).toContain("You are Computer Cat");
        expect(context.systemPrompt).not.toContain("GitHub authentication");
        return fauxAssistantMessage("Hello from the real Pi loop.");
      },
    ]);
    const runtime = await createPiRuntime(
      { provider: "cat-test", model: "offline", apiKey: "" },
      process.cwd(),
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
      COMPUTERCAT_API_KEY: "chosen-secret",
    });
  });
});
