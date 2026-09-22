import type { Model, Provider } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";

// Pi 0.85.1 does not yet list GPT-6 Luna. Keep this overlay in one place so
// main's model picker and the worker use exactly the same model metadata.
// Model capabilities and API rates: https://developers.openai.com/api/docs/models/gpt-6-luna
// The Codex transport and compatibility flags come from Pi's existing Luna entry.
export function computerCatCodexProvider(): Provider {
  const provider = openaiCodexProvider();
  const previousLuna = provider.getModels().find((model) => model.id === "gpt-5.6-luna");
  if (!previousLuna) throw new Error("Pi's Codex Luna model is unavailable.");
  const luna: Model<"openai-codex-responses"> = {
    ...previousLuna,
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    cost: {
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite: 0.125,
      tiers: [
        { inputTokensAbove: 272_000, input: 0.2, output: 0.75, cacheRead: 0.02, cacheWrite: 0.25 },
      ],
    },
    thinkingLevelMap: {
      off: "none",
      minimal: "low",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
  };
  return { ...provider, getModels: () => [...provider.getModels(), luna] };
}
