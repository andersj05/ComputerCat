import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Task } from "../../../evals/core";
import { createPiRuntime } from "../pi-runtime";
import type { FixtureWorld } from "./fixtures";

export const LIVE_MODEL = "gpt-6-luna";
export const LIVE_REASONING = "medium";
export const LIMITS = {
  requests: 6,
  toolCalls: 12,
  seconds: 90,
  batchRequests: 96,
} as const;
export interface LiveCall {
  id: string;
  name: string;
  input: unknown;
  turn: number;
  error: boolean;
  complete: boolean;
  output?: unknown;
}
export interface LiveTrace {
  responses: string[];
  calls: LiveCall[];
  requests: number;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    reasoning: number | null;
    messages: number;
  };
  durationSeconds: number;
  cancelledInMs: number | null;
  error: string | null;
}
export interface RequestBudget {
  remaining: number;
}
export function instrumentSession(
  session: AgentSession,
  trace: LiveTrace,
  world: FixtureWorld,
  budget: RequestBudget,
) {
  const stream = session.agent.streamFunction;
  session.agent.streamFunction = (model, context, options) => {
    if (trace.requests >= LIMITS.requests || budget.remaining <= 0) {
      trace.error = "Model request budget reached";
      throw new Error(trace.error);
    }
    trace.requests++;
    budget.remaining--;
    return stream(model, context, { ...options, maxRetries: 0 });
  };
  const before = session.agent.beforeToolCall;
  let toolAttempts = 0;
  session.agent.beforeToolCall = async (context, signal) => {
    if (++toolAttempts > LIMITS.toolCalls) {
      trace.error = "Tool call budget reached";
      session.agent.abort();
      return { block: true, reason: trace.error };
    }
    return before?.(context, signal);
  };
  session.subscribe((event) => {
    if (event.type === "tool_execution_start")
      trace.calls.push({
        id: event.toolCallId,
        name: event.toolName,
        input: event.args,
        turn: world.turn,
        complete: false,
        error: false,
      });
    if (event.type === "tool_execution_end") {
      const call = trace.calls.find((call) => call.id === event.toolCallId);
      if (call) {
        call.complete = true;
        call.error = event.isError;
        call.output = event.result;
      }
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      const message = event.message;
      if (message.stopReason === "stop")
        trace.responses[world.turn - 1] = message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
      const usage = message.usage;
      trace.usage.messages++;
      trace.usage.input += usage.input;
      trace.usage.output += usage.output;
      trace.usage.cacheRead += usage.cacheRead;
      trace.usage.cacheWrite += usage.cacheWrite;
      trace.usage.total += usage.totalTokens;
      if (usage.reasoning !== undefined)
        trace.usage.reasoning = (trace.usage.reasoning ?? 0) + usage.reasoning;
    }
  });
}
export async function runLiveTask(
  task: Task,
  world: FixtureWorld,
  accessToken: string,
  signal: AbortSignal,
  budget: RequestBudget,
  injectedModels?: ModelRuntime,
): Promise<LiveTrace> {
  const trace: LiveTrace = {
    responses: [],
    calls: [],
    requests: 0,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      reasoning: null,
      messages: 0,
    },
    durationSeconds: 0,
    cancelledInMs: null,
    error: null,
  };
  const started = performance.now();
  const deadline = AbortSignal.timeout(LIMITS.seconds * 1000);
  const lifetime = AbortSignal.any([signal, deadline]);
  const runtime = await createPiRuntime(
    { provider: "openai-codex", model: LIVE_MODEL, apiKey: accessToken, reasoning: LIVE_REASONING },
    world.cwd,
    injectedModels,
    undefined,
    world.desktop,
    world.web.execute,
    {
      builtInTools: world.builtInTools,
      configure: (session) => instrumentSession(session, trace, world, budget),
    },
  );
  try {
    for (const [index, prompt] of task.prompts.entries()) {
      lifetime.throwIfAborted();
      world.nextTurn();
      const stop = new AbortController();
      const turnSignal = AbortSignal.any([lifetime, stop.signal]);
      let stoppedAt: number | undefined;
      try {
        await runtime.run(
          prompt.replaceAll("{{fixtureDir}}", world.cwd.replaceAll("\\", "/")),
          turnSignal,
          () => {
            if (task.id === "stop-and-resume" && index === 0 && stoppedAt === undefined) {
              stoppedAt = performance.now();
              stop.abort();
            }
          },
        );
      } catch (error) {
        if (stoppedAt !== undefined && !lifetime.aborted)
          trace.cancelledInMs = performance.now() - stoppedAt;
        else throw error;
      } finally {
        stop.abort();
      }
    }
  } catch {
    trace.error ??= lifetime.aborted
      ? "Attempt cancelled or timed out"
      : "Provider or runtime failed";
  } finally {
    runtime.dispose();
    world.dispose();
    trace.durationSeconds = (performance.now() - started) / 1000;
  }
  return trace;
}
