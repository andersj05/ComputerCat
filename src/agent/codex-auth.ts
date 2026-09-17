import { randomUUID } from "node:crypto";
import {
  type AuthOperationOptions,
  type AuthPrompt,
  type Credential,
  type CredentialStore,
  createModels,
  getSupportedThinkingLevels,
  type Provider,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { z } from "zod";
import type { ActionResult } from "../shared/contracts";
import type { CodexConnection, LoginMethod, ModelChoice } from "../shared/models";
import { reasoningSchema } from "../shared/validation";
import { UserFacingError } from "./runtime";

export const CODEX_PROVIDER = "openai-codex";
const credentialSchema = z.object({
  type: z.literal("oauth"),
  access: z.string().min(1).max(32768),
  refresh: z.string().min(1).max(32768),
  expires: z.number().finite().positive(),
  accountId: z.string().min(1).max(512),
});

export interface SecretPersistence {
  available(): boolean;
  read(): Promise<string | undefined>;
  write(value: string | undefined): Promise<void>;
}

class CodexCredentials implements CredentialStore {
  private value: Credential | undefined;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: SecretPersistence) {}

  async load(): Promise<void> {
    const stored = await this.storage.read();
    this.value = stored ? credentialSchema.parse(JSON.parse(stored)) : undefined;
  }

  hasCredential(): boolean {
    return this.value !== undefined;
  }

  async read(provider: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    return provider === CODEX_PROVIDER ? structuredClone(this.value) : undefined;
  }

  async list() {
    return this.value ? [{ providerId: CODEX_PROVIDER, type: "oauth" as const }] : [];
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.pending.then(action);
    this.pending = operation.catch(() => {});
    return operation;
  }

  modify(
    provider: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    return this.enqueue(async () => {
      if (provider !== CODEX_PROVIDER) throw new Error("Unexpected credential provider.");
      options?.signal?.throwIfAborted();
      const refreshing = this.value !== undefined;
      const next = await fn(structuredClone(this.value));
      // Preserve a completed token rotation even if its requesting turn was stopped.
      if (!refreshing) options?.signal?.throwIfAborted();
      if (next) {
        const validated = credentialSchema.parse(next);
        await this.storage.write(JSON.stringify(validated));
        if (!refreshing && options?.signal?.aborted) {
          await this.storage.write(this.value ? JSON.stringify(this.value) : undefined);
          options.signal.throwIfAborted();
        }
        this.value = validated;
      }
      return structuredClone(this.value);
    });
  }

  delete(provider: string, options?: AuthOperationOptions): Promise<void> {
    return this.enqueue(async () => {
      if (provider !== CODEX_PROVIDER) throw new Error("Unexpected credential provider.");
      options?.signal?.throwIfAborted();
      await this.storage.write(undefined);
      this.value = undefined;
    });
  }
}

export function isCodexSignInUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://auth.openai.com" &&
      !url.username &&
      !url.password &&
      (url.pathname === "/oauth/authorize" || url.pathname === "/codex/device")
    );
  } catch {
    return false;
  }
}

/** Pi owns OAuth; the host owns encryption, browser opening, and renderer notifications. */
export class CodexAuth {
  private readonly credentials: CodexCredentials;
  private readonly models;
  private attempt:
    | { id: string; abort: AbortController; url?: string; submit?: (code: string) => void }
    | undefined;
  private login: CodexConnection["login"] = null;
  private message: string | null = null;
  private sessionAbort = new AbortController();
  private disposed = false;

  constructor(
    private readonly storage: SecretPersistence,
    private readonly openBrowser: (url: string) => Promise<void>,
    private readonly changed: () => void,
    provider: Provider = openaiCodexProvider(),
  ) {
    this.credentials = new CodexCredentials(storage);
    this.models = createModels({
      credentials: this.credentials,
      authContext: { env: async () => undefined, fileExists: async () => false },
    });
    this.models.setProvider(provider);
  }

  async load(): Promise<void> {
    try {
      await this.credentials.load();
    } catch {
      this.message = "Couldn't unlock the saved Codex connection. Sign in again.";
    }
  }

  catalog(): ModelChoice[] {
    return this.models.getModels(CODEX_PROVIDER).map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: getSupportedThinkingLevels(model).filter(
        (level) => reasoningSchema.safeParse(level).success,
      ),
    }));
  }

  snapshot(): CodexConnection {
    return {
      connected: this.credentials.hasCredential(),
      storageAvailable: this.storage.available(),
      login: this.login ? { ...this.login } : null,
      message: this.message,
    };
  }

  private publish(): void {
    if (!this.disposed) this.changed();
  }

  start(method: LoginMethod): ActionResult {
    if (this.disposed) return { ok: false, message: "The app is closing." };
    if (this.attempt) return { ok: false, message: "A sign-in is already in progress." };
    if (this.credentials.hasCredential())
      return { ok: false, message: "Disconnect before signing in to another account." };
    if (!this.storage.available())
      return { ok: false, message: "Secure credential storage is unavailable on this computer." };
    const attempt = { id: randomUUID(), abort: new AbortController() };
    this.attempt = attempt;
    this.login = {
      attemptId: attempt.id,
      method,
      canOpenBrowser: false,
      acceptsCode: false,
      userCode: null,
    };
    this.message = null;
    this.publish();
    const timer = setTimeout(() => {
      if (this.attempt !== attempt) return;
      this.cancel(attempt.id);
      this.message = "Sign-in timed out. Please try again.";
      this.publish();
    }, 15 * 60_000);
    void this.models
      .login(CODEX_PROVIDER, "oauth", {
        signal: attempt.abort.signal,
        prompt: (prompt) => this.prompt(attempt.id, method, prompt),
        notify: (event) => {
          if (this.attempt !== attempt || !this.login) return;
          if (event.type !== "auth_url" && event.type !== "device_code") return;
          const url = event.type === "auth_url" ? event.url : event.verificationUri;
          if (!isCodexSignInUrl(url)) throw new Error("Unexpected sign-in destination.");
          this.attempt.url = url;
          this.login.canOpenBrowser = true;
          this.login.userCode = event.type === "device_code" ? event.userCode : null;
          this.publish();
          void this.openSignIn(attempt.id);
        },
      })
      .then(() => {
        if (this.attempt !== attempt) return;
        this.message = null;
      })
      .catch(() => {
        if (this.attempt !== attempt) return;
        this.message =
          method === "device_code"
            ? "Couldn't connect. Try browser sign-in, or enable device-code login in your ChatGPT security settings."
            : "Couldn't complete sign-in. Try again or use a device code.";
      })
      .finally(() => {
        clearTimeout(timer);
        if (this.attempt !== attempt) return;
        this.attempt = undefined;
        this.login = null;
        this.publish();
      });
    return { ok: true };
  }

  private prompt(attemptId: string, method: LoginMethod, prompt: AuthPrompt): Promise<string> {
    const attempt = this.attempt;
    if (!attempt || attempt.id !== attemptId)
      return Promise.reject(new Error("Sign-in cancelled."));
    if (prompt.type === "select") {
      if (!prompt.options.some((option) => option.id === method))
        return Promise.reject(new Error("Unsupported login method."));
      return Promise.resolve(method);
    }
    if (prompt.type !== "manual_code")
      return Promise.reject(new Error("Unexpected sign-in prompt."));
    const signal = prompt.signal
      ? AbortSignal.any([prompt.signal, attempt.abort.signal])
      : attempt.abort.signal;
    return new Promise((resolve, reject) => {
      const abort = () => {
        cleanup();
        reject(new Error("Sign-in cancelled."));
      };
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        delete attempt.submit;
        if (this.attempt === attempt && this.login) {
          this.login.acceptsCode = false;
          this.publish();
        }
      };
      attempt.submit = (code) => {
        cleanup();
        resolve(code);
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else if (this.login) {
        this.login.acceptsCode = true;
        this.publish();
      }
    });
  }

  async openSignIn(attemptId: string): Promise<ActionResult> {
    const attempt = this.attempt;
    if (!attempt || attempt.id !== attemptId || !attempt.url)
      return { ok: false, message: "Start sign-in again to open its page." };
    try {
      await this.openBrowser(attempt.url);
      return { ok: true };
    } catch {
      if (this.attempt === attempt) {
        this.message = "Couldn't open your browser. Use Open sign-in page to retry.";
        this.publish();
      }
      return { ok: false, message: "Couldn't open the sign-in page." };
    }
  }

  submit(attemptId: string, code: string): ActionResult {
    if (this.attempt?.id !== attemptId || !this.attempt.submit)
      return { ok: false, message: "That sign-in has ended. Please start again." };
    // Require the full redirect and matching OAuth state, even though the SDK also accepts bare codes.
    try {
      const callback = new URL(code);
      const authorize = new URL(this.attempt.url ?? "");
      if (
        callback.origin !== "http://localhost:1455" ||
        callback.pathname !== "/auth/callback" ||
        !callback.searchParams.get("code") ||
        !authorize.searchParams.get("state") ||
        callback.searchParams.get("state") !== authorize.searchParams.get("state")
      )
        throw new Error("Invalid callback.");
    } catch {
      return { ok: false, message: "Paste the complete localhost callback URL from this sign-in." };
    }
    this.attempt.submit(code);
    return { ok: true };
  }

  cancel(attemptId: string): ActionResult {
    if (this.attempt?.id !== attemptId)
      return { ok: false, message: "That sign-in has already ended." };
    this.attempt.abort.abort();
    this.attempt = undefined;
    this.login = null;
    this.message = null;
    this.publish();
    return { ok: true };
  }

  async disconnect(): Promise<ActionResult> {
    if (this.attempt) this.cancel(this.attempt.id);
    this.sessionAbort.abort();
    this.sessionAbort = new AbortController();
    try {
      await this.models.logout(CODEX_PROVIDER);
      this.message = null;
      this.publish();
      return { ok: true };
    } catch {
      return { ok: false, message: "Couldn't remove the saved connection. Please try again." };
    }
  }

  async accessToken(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    if (!this.credentials.hasCredential())
      throw new UserFacingError("Connect your Codex subscription in Options → Models first.");
    try {
      const resolved = await this.models.getAuth(CODEX_PROVIDER, {
        signal: AbortSignal.any([signal, this.sessionAbort.signal, AbortSignal.timeout(30_000)]),
      });
      signal.throwIfAborted();
      if (!resolved?.auth.apiKey) throw new Error("No subscription credential.");
      if (this.message) {
        this.message = null;
        this.publish();
      }
      return resolved.auth.apiKey;
    } catch {
      signal.throwIfAborted();
      this.message =
        "Couldn't refresh your Codex connection. Check your network, or disconnect and sign in again.";
      this.publish();
      throw new UserFacingError(this.message);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.attempt) this.cancel(this.attempt.id);
    this.sessionAbort.abort();
  }
}
