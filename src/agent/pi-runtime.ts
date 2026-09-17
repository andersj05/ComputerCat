import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { RuntimeConfig } from "./config";
import { type AgentRuntime, SYSTEM_PROMPT, UserFacingError } from "./runtime";

export function isolatedResources(): ResourceLoader {
  const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
  return {
    getExtensions: () => extensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => SYSTEM_PROMPT,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

export async function createModelRuntime(): Promise<ModelRuntime> {
  return ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
}

export async function createPiRuntime(
  config: Pick<RuntimeConfig, "provider" | "model" | "apiKey" | "reasoning">,
  cwd: string,
  injectedModels?: ModelRuntime,
): Promise<AgentRuntime> {
  const models = injectedModels ?? (await createModelRuntime());
  const model = models.getModel(config.provider, config.model);
  if (!model)
    throw new UserFacingError("The configured model is unavailable. Check your model settings.");
  if (config.apiKey) await models.setRuntimeApiKey(config.provider, config.apiKey);
  const { session } = await createAgentSession({
    cwd,
    modelRuntime: models,
    model,
    ...(config.reasoning ? { thinkingLevel: config.reasoning } : {}),
    tools: [],
    noTools: "all",
    resourceLoader: isolatedResources(),
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }),
  });

  return {
    async run(prompt, signal, onDelta) {
      signal.throwIfAborted();
      let providerFailed = false;
      const unsubscribe = session.subscribe((event) => {
        if (signal.aborted) return;
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          onDelta(event.assistantMessageEvent.delta);
        }
        if (event.type === "message_end" && event.message.role === "assistant") {
          providerFailed = event.message.stopReason === "error";
        }
      });
      const abort = () => {
        void session.abort();
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        await session.prompt(prompt, { expandPromptTemplates: false });
        signal.throwIfAborted();
        if (providerFailed)
          throw new UserFacingError(
            config.provider === "openai-codex"
              ? "Codex couldn't finish this reply. Your plan may not include this model, or its usage limit may be reached. Check your connection, try another model in Options → Models and start a new conversation, or reconnect."
              : "The model couldn't finish this reply. Check your connection and model configuration, then try again.",
          );
      } finally {
        signal.removeEventListener("abort", abort);
        unsubscribe();
      }
    },
    dispose: () => session.dispose(),
  };
}
