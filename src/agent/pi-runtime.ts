import { dirname } from "node:path";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import {
  type AgentSession,
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "../shared/contracts";
import type { DesktopExecutor } from "../shared/desktop";
import { ALL_TOOL_NAMES, PI_TOOL_NAMES } from "../shared/tools";
import type { WebExecutor } from "../shared/web";
import { createComputerTools } from "./computer-tools";
import type { RuntimeConfig } from "./config";
import { createDesktopTools } from "./desktop-tools";
import { createDesktopUtilityTools } from "./desktop-utility-tools";
import { type AgentRuntime, SYSTEM_PROMPT, UserFacingError } from "./runtime";
import { createWebTools } from "./web-tools";

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

/** Explicit test adapters; never populated by the renderer, environment or production worker. */
export interface PiRuntimeAdapters {
  builtInTools: ToolDefinition[];
  configure?: (session: AgentSession) => void;
}

export async function createPiRuntime(
  config: Pick<RuntimeConfig, "provider" | "model" | "apiKey" | "reasoning">,
  cwd: string,
  injectedModels?: ModelRuntime,
  saved?: { sessionFile: string; history: ChatMessage[] },
  desktop?: DesktopExecutor,
  web?: WebExecutor,
  adapters?: PiRuntimeAdapters,
): Promise<AgentRuntime> {
  if (
    adapters &&
    (adapters.builtInTools.length !== PI_TOOL_NAMES.length ||
      PI_TOOL_NAMES.some(
        (name) => adapters.builtInTools.filter((tool) => tool.name === name).length !== 1,
      ))
  )
    throw new Error("Test adapters must replace every built-in tool exactly once.");
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
  const customTools = [
    ...(adapters?.builtInTools ?? []),
    ...(desktop
      ? [
          ...createDesktopTools(desktop, model.input.includes("image")),
          ...createComputerTools(desktop),
          ...createDesktopUtilityTools(desktop),
        ]
      : []),
    ...(web ? createWebTools(web) : []),
  ];
  const { session } = await createAgentSession({
    cwd,
    modelRuntime: models,
    model,
    ...(config.reasoning ? { thinkingLevel: config.reasoning } : {}),
    tools: [...PI_TOOL_NAMES, ...customTools.map((tool) => tool.name)],
    customTools,
    resourceLoader: isolatedResources(),
    sessionManager: manager,
    settingsManager: SettingsManager.inMemory({
      retry: { enabled: false },
      // Use SSE without a background WebSocket connection cache.
      ...(config.provider === "openai-codex" ? { transport: "sse" as const } : {}),
    }),
  });

  try {
    adapters?.configure?.(session);
  } catch (error) {
    session.dispose();
    throw error;
  }

  return {
    async run(prompt, signal, onDelta, onTool) {
      signal.throwIfAborted();
      let providerFailed = false;
      let hasText = false;
      let separateText = false;
      const unsubscribe = session.subscribe((event) => {
        if (signal.aborted) return;
        if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
          const name = ALL_TOOL_NAMES.find((name) => name === event.toolName);
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
        if (event.type === "message_start" && event.message.role === "assistant")
          separateText = hasText;
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          if (separateText) {
            onDelta("\n\n");
            separateText = false;
          }
          hasText = true;
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
              ? "Codex couldn't finish this reply. Your plan may not include this model, or its usage limit may be reached. Check your connection, choose another model above the chat, or reconnect through Connections."
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
