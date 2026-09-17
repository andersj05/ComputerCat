import type { CodexAuth } from "../agent/codex-auth";
import { isConfigured, type RuntimeConfig } from "../agent/config";
import { DemoRuntime } from "../agent/demo-runtime";
import type { AgentRuntime } from "../agent/runtime";
import { UserFacingError } from "../agent/runtime";
import type { ActionResult } from "../shared/contracts";
import type { ModelSettings, ModelState } from "../shared/models";
import { modelSettingsSchema } from "../shared/validation";
import type { ModelSettingsStore } from "./model-settings";

export class ModelController {
  private active: ModelSettings;

  constructor(
    private readonly settings: ModelSettingsStore,
    private readonly codex: Pick<CodexAuth, "catalog" | "snapshot" | "accessToken">,
    private readonly environment: RuntimeConfig,
    private readonly worker: (
      config: (signal: AbortSignal) => Promise<RuntimeConfig>,
      context?: { sessionFile: string; history: import("../shared/contracts").ChatMessage[] },
    ) => AgentRuntime,
    private readonly changed: () => void,
  ) {
    this.active = settings.snapshot();
  }

  snapshot(): ModelState {
    return {
      defaults: this.settings.snapshot(),
      active: { ...this.active },
      models: this.codex.catalog(),
      codex: this.codex.snapshot(),
      environment: {
        configured: isConfigured(this.environment),
        provider: this.environment.provider || null,
        model: this.environment.model || null,
      },
    };
  }

  validate(input: unknown): ActionResult {
    const parsed = modelSettingsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Choose valid model settings." };
    const settings = parsed.data;
    // Even a malicious renderer can only select catalogue models and supported reasoning levels.
    const model = this.codex.catalog().find((entry) => entry.id === settings.codexModel);
    if (settings.source === "codex") {
      if (!this.codex.snapshot().connected)
        return { ok: false, message: "Sign in with ChatGPT before choosing Codex subscription." };
      if (!model?.reasoning.includes(settings.reasoning))
        return { ok: false, message: "Choose an available Codex model and reasoning level." };
    }
    if (settings.source === "environment" && !isConfigured(this.environment))
      return {
        ok: false,
        message: "Configure the environment provider, model, and API key first.",
      };
    return { ok: true };
  }

  async update(input: unknown): Promise<ActionResult> {
    const valid = this.validate(input);
    if (!valid.ok) return valid;
    const settings = modelSettingsSchema.parse(input);
    const result = await this.settings.update(settings);
    if (result.ok) this.changed();
    return result;
  }

  createRuntime(
    selected: ModelSettings = this.settings.snapshot(),
    context?: { sessionFile: string; history: import("../shared/contracts").ChatMessage[] },
  ): AgentRuntime {
    this.active = selected;
    this.changed();
    if (selected.source === "demo") return new DemoRuntime();
    return this.worker(async (signal) => {
      if (selected.source === "environment") return { ...this.environment, mode: "pi" };
      const model = this.codex.catalog().find((entry) => entry.id === selected.codexModel);
      if (!model?.reasoning.includes(selected.reasoning))
        throw new UserFacingError(
          "Your saved model is unavailable. Choose another in Options → Models, then start a new conversation.",
        );
      return {
        mode: "pi",
        provider: "openai-codex",
        model: selected.codexModel,
        apiKey: await this.codex.accessToken(signal),
        reasoning: selected.reasoning,
      };
    }, context);
  }
}
