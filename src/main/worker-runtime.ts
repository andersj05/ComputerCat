import { randomUUID } from "node:crypto";
import { type UtilityProcess, utilityProcess } from "electron";
import { isConfigured, type RuntimeConfig, workerEnvironment } from "../agent/config";
import { workerConfigSchema, workerEventSchema } from "../agent/protocol";
import { type AgentRuntime, UserFacingError } from "../agent/runtime";
import { type DesktopExecutor, desktopError, desktopResultSchema } from "../shared/desktop";
import type { ToolActivity } from "../shared/tools";
import { type WebExecutor, webError, webResultSchema } from "../shared/web";

export class WorkerRuntime implements AgentRuntime {
  private child: UtilityProcess | undefined;
  private finish: ((error?: Error) => void) | undefined;
  private faulted = false;
  private preparing = false;
  private readonly lifetime = new AbortController();

  constructor(
    private readonly entry: string,
    private readonly cwd: string,
    private readonly resolveConfig: (signal: AbortSignal) => Promise<RuntimeConfig>,
    private readonly context?: {
      sessionFile: string;
      history: import("../shared/contracts").ChatMessage[];
    },
    private readonly toolCache?: { directory: string; allowDownloads: boolean },
    private readonly desktop?: DesktopExecutor,
    private readonly web?: WebExecutor,
  ) {}

  async run(
    prompt: string,
    signal: AbortSignal,
    onDelta: (text: string) => void,
    onTool?: (activity: ToolActivity) => void,
  ): Promise<void> {
    signal.throwIfAborted();
    if (this.finish || this.preparing) throw new UserFacingError("A reply is already in progress.");
    if (this.faulted)
      throw new UserFacingError(
        "The model session was interrupted. Start a new chat to reconnect.",
      );
    const preparationSignal = AbortSignal.any([signal, this.lifetime.signal]);
    this.preparing = true;
    let config: RuntimeConfig;
    try {
      preparationSignal.throwIfAborted();
      config = await this.resolveConfig(preparationSignal);
      preparationSignal.throwIfAborted();
      if (!isConfigured(config))
        throw new UserFacingError(
          "A model isn't connected yet. Open Options → Models to choose a connection.",
        );
      const parsed = workerConfigSchema.safeParse(config);
      if (!parsed.success)
        throw new UserFacingError("The model configuration is invalid. Check Options → Models.");
      config = parsed.data;
    } finally {
      this.preparing = false;
    }
    const child =
      this.child ??
      utilityProcess.fork(this.entry, [], {
        cwd: this.cwd,
        env: {
          ...workerEnvironment(process.env),
          ...(this.toolCache
            ? {
                PI_CODING_AGENT_DIR: this.toolCache.directory,
                PI_OFFLINE: this.toolCache.allowDownloads ? "0" : "1",
              }
            : {}),
        },
        serviceName: "Computer Cat agent",
        stdio: "ignore",
      });
    if (!this.child) {
      child.once("exit", () => {
        // Also notice a crash between turns, when no request listener is attached.
        if (this.child === child) {
          this.child = undefined;
          this.faulted = true;
        }
      });
    }
    this.child = child;
    const id = randomUUID();
    await new Promise<void>((resolve, reject) => {
      const observations = new AbortController();
      const desktopSignal = AbortSignal.any([signal, this.lifetime.signal, observations.signal]);
      const calls = new Set<string>();
      let desktopBusy = false;
      const webCalls = new Set<string>();
      let webBusy = false;
      let settled = false;
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = setTimeout(
        () => {
          this.faulted = true;
          child.kill();
          finish(new UserFacingError("The model took too long. Start a new chat to reconnect."));
        },
        config.provider === "openai-codex" ? 600_000 : 120_000,
      );
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        observations.abort();
        clearTimeout(timeout);
        clearTimeout(stopTimer);
        signal.removeEventListener("abort", stop);
        child.removeListener("message", message);
        child.removeListener("exit", exited);
        this.finish = undefined;
        if (error) reject(error);
        else resolve();
      };
      this.finish = finish;
      const post = (message: unknown): boolean => {
        try {
          child.postMessage(message);
          return true;
        } catch {
          this.faulted = true;
          this.child = undefined;
          finish(
            new UserFacingError("The model session disconnected. Start a new chat to reconnect."),
          );
          try {
            child.kill();
          } catch {
            // The worker may already have exited before its exit event reached main.
          }
          return false;
        }
      };
      const message = (input: unknown) => {
        const parsed = workerEventSchema.safeParse(input);
        if (!parsed.success || parsed.data.id !== id) return;
        const event = parsed.data;
        if (event.type === "web-request" && !desktopSignal.aborted) {
          if (webCalls.has(event.callId)) return;
          const reply = (result: unknown) => {
            if (desktopSignal.aborted || settled || this.child !== child) return;
            const checked = webResultSchema.safeParse(result);
            post({
              type: "web-result",
              id,
              callId: event.callId,
              result: checked.success ? checked.data : webError("Invalid web response."),
            });
          };
          if (webCalls.size >= 20) {
            reply(webError("Web tool limit reached for this reply. Ask the user to continue."));
            return;
          }
          webCalls.add(event.callId);
          if (!this.web || webBusy) {
            reply(
              webError(
                webBusy ? "Another web request is in progress." : "Web tools are unavailable.",
              ),
            );
            return;
          }
          webBusy = true;
          void Promise.resolve()
            .then(() => {
              desktopSignal.throwIfAborted();
              return this.web?.(event.request, desktopSignal);
            })
            .then(reply, () => reply(webError("The web request failed or was cancelled.")))
            .finally(() => {
              webBusy = false;
            });
        }
        if (event.type === "desktop-request" && !desktopSignal.aborted) {
          if (calls.has(event.callId)) return;
          const reply = (result: unknown) => {
            if (desktopSignal.aborted || settled || this.child !== child) return;
            const checked = desktopResultSchema.safeParse(result);
            post({
              type: "desktop-result",
              id,
              callId: event.callId,
              result: checked.success
                ? checked.data
                : desktopError(
                    "Invalid desktop tool response. An action may already have happened; inspect before retrying.",
                  ),
            });
          };
          if (calls.size >= 20) {
            reply(
              desktopError("Desktop tool limit reached for this reply. Ask the user to continue."),
            );
            return;
          }
          calls.add(event.callId);
          if (!this.desktop || desktopBusy) {
            reply(
              desktopError(
                desktopBusy
                  ? "Another desktop operation is in progress."
                  : "Desktop tools are unavailable.",
              ),
            );
            return;
          }
          desktopBusy = true;
          void Promise.resolve()
            .then(() => {
              desktopSignal.throwIfAborted();
              return this.desktop?.(event.request, desktopSignal);
            })
            .then(reply, () =>
              reply(
                desktopError(
                  "The desktop request failed or was cancelled. An action may already have happened; inspect before retrying.",
                ),
              ),
            )
            .finally(() => {
              desktopBusy = false;
            });
        }
        if (event.type === "delta" && !signal.aborted) onDelta(event.text);
        if (event.type === "tool" && !signal.aborted) onTool?.(event.activity);
        if (event.type === "done") finish();
        if (event.type === "error") finish(new UserFacingError(event.message));
      };
      const exited = () => {
        this.child = undefined;
        this.faulted = true;
        finish(
          new UserFacingError(
            "The model session closed unexpectedly. Start a new chat to reconnect.",
          ),
        );
      };
      const stop = () => {
        if (!post({ type: "stop", id })) return;
        stopTimer = setTimeout(() => {
          this.faulted = true;
          child.kill();
          this.child = undefined;
          finish();
        }, 2000);
      };
      child.on("message", message);
      child.once("exit", exited);
      signal.addEventListener("abort", stop, { once: true });
      post({
        type: "run",
        id,
        prompt,
        config,
        ...(this.context
          ? {
              context: {
                sessionFile: this.context.sessionFile,
                history: this.context.history.map(({ id, role, text, state }) => ({
                  id,
                  role,
                  text,
                  state,
                })),
              },
            }
          : {}),
      });
    });
  }

  dispose(): void {
    this.lifetime.abort();
    this.finish?.();
    this.child?.kill();
    this.child = undefined;
  }
}
