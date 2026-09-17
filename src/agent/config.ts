import type { ReasoningLevel } from "../shared/models";

export interface RuntimeConfig {
  mode: "demo" | "pi";
  provider: string;
  model: string;
  apiKey: string;
  reasoning?: ReasoningLevel;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  return {
    mode: env.COMPUTERCAT_RUNTIME === "pi" ? "pi" : "demo",
    provider: env.COMPUTERCAT_PROVIDER?.trim() ?? "",
    model: env.COMPUTERCAT_MODEL?.trim() ?? "",
    apiKey: env.COMPUTERCAT_API_KEY?.trim() ?? "",
  };
}

export function isConfigured(config: RuntimeConfig): boolean {
  return Boolean(config.provider && config.model && config.apiKey);
}

// An explicit environment prevents accidental reuse of global provider logins or Node hooks.
export function workerEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = { PI_OFFLINE: "1", NO_COLOR: "1" };
  const allowed = new Set([
    "path",
    "systemroot",
    "windir",
    "temp",
    "tmp",
    "userprofile",
    "home",
    "appdata",
    "localappdata",
    "lang",
    "lc_all",
    "https_proxy",
    "http_proxy",
    "no_proxy",
  ]);
  for (const [key, value] of Object.entries(env)) {
    if (allowed.has(key.toLowerCase()) && value !== undefined) result[key] = value;
  }
  return result;
}
