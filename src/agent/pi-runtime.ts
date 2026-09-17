import { dirname } from "node:path";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "../shared/contracts";
import { PI_TOOL_NAMES } from "../shared/tools";
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
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const codex = openaiCodexProvider();
  // Main has already resolved OAuth. The worker accepts only that short-lived token;
  // it cannot log in, refresh, or consult ambient provider credentials.
  runtime.registerNativeProvider({
    ...codex,
    auth: {
      apiKey: {
        name: "Computer Cat Codex access token",
        resolve: async ({ credential, signal }) => {
          signal.throwIfAborted();
          return credential?.key ? { auth: { apiKey: credential.key } } : undefined;
        },
      },
    },
  });
  return runtime;
}

export async function createPiRuntime(
  config: Pick<RuntimeConfig, "provider" | "model" | "apiKey" | "reasoning">,
  cwd: string,
  injectedModels?: ModelRuntime,
  saved?: { sessionFile: string; history: ChatMessage[] },
): Promise<AgentRuntime> {
  const models = injectedModels ?? (await createModelRuntime());
  const model = models.getModel(config.provider, config.model);
  if (!model)
    throw new UserFacingError("The configured model is unavailable. Check your model settings.");
  if (config.apiKey) await models.setRuntimeApiKey(config.provider, config.apiKey);
  let manager: SessionManager;
  try {
    manager = saved
      ? SessionManager.open(saved.sessionFile, dirname(saved.sessionFile), cwd)
      : SessionManager.inMemory(cwd);
  } catch {
    throw new UserFacingError(
      "This conversation's model context couldn't be opened. Its saved files were kept. Start a new conversation to continue.",
    );
  }
  let visibleCount = saved?.history.length ?? 0;
  const marker = manager
    .getEntries()
    .findLast((entry) => entry.type === "custom" && entry.customType === "computercat-transcript");
  const data = marker?.type === "custom" ? (marker.data as { count?: unknown }) : undefined;
  const synced =
    typeof data?.count === "number" && Number.isSafeInteger(data.count) && data.count >= 0
      ? data.count
      : 0;
  // Fill gaps from demo conversations or a missing native file. Native Pi tool results stay intact.
  for (const message of saved?.history.slice(synced) ?? []) {
    if (!message.text) continue;
    if (message.role === "user")
      manager.appendMessage({ role: "user", content: message.text, timestamp: Date.now() });
    else
      manager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: message.text }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason:
          message.state === "stopped" ? "aborted" : message.state === "error" ? "error" : "stop",
        timestamp: Date.now(),
      });
  }
  const { session } = await createAgentSession({
    cwd,
    modelRuntime: models,
    model,
    ...(config.reasoning ? { thinkingLevel: config.reasoning } : {}),
    tools: [...PI_TOOL_NAMES],
    resourceLoader: isolatedResources(),
    sessionManager: manager,
    settingsManager: SettingsManager.inMemory({
      retry: { enabled: false },
      // Use SSE without a background WebSocket connection cache.
      ...(config.provider === "openai-codex" ? { transport: "sse" as const } : {}),
    }),
  });

  return {
    async run(prompt, signal, onDelta, onTool) {
      signal.throwIfAborted();
      let providerFailed = false;
      const unsubscribe = session.subscribe((event) => {
        if (signal.aborted) return;
        if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
          const name = PI_TOOL_NAMES.find((name) => name === event.toolName);
          if (name)
            onTool?.({
              id: event.toolCallId,
              name,
              state:
                event.type === "tool_execution_start"
                  ? "running"
                  : event.isError
                    ? "error"
                    : "complete",
            });
        }
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
        visibleCount += 2;
        manager.appendCustomEntry("computercat-transcript", { count: visibleCount });
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
