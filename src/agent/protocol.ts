import { z } from "zod";
import { desktopRequestSchema, desktopResultSchema } from "../shared/desktop";
import { ALL_TOOL_NAMES } from "../shared/tools";
import { reasoningSchema } from "../shared/validation";
import { webRequestSchema, webResultSchema } from "../shared/web";

export const toolActivitySchema = z.strictObject({
  id: z.string().min(1).max(256),
  name: z.enum(ALL_TOOL_NAMES),
  state: z.enum(["running", "complete", "error", "stopped"]),
});

export const workerConfigSchema = z.strictObject({
  mode: z.literal("pi"),
  provider: z.string().min(1).max(128),
  model: z.string().min(1).max(120),
  apiKey: z.string().min(1).max(32768),
  reasoning: reasoningSchema.default("medium"),
});

export const workerRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("web-result"),
    id: z.uuid(),
    callId: z.uuid(),
    result: webResultSchema,
  }),
  z.strictObject({
    type: z.literal("run"),
    id: z.uuid(),
    prompt: z.string().min(1).max(6000),
    config: workerConfigSchema,
    context: z
      .strictObject({
        sessionFile: z.string().min(1).max(4096),
        history: z
          .array(
            z.strictObject({
              id: z.string().max(256),
              role: z.enum(["user", "assistant"]),
              text: z.string().max(65536),
              state: z.enum(["complete", "streaming", "stopped", "error"]),
            }),
          )
          .max(1000),
      })
      .optional(),
  }),
  z.strictObject({ type: z.literal("stop"), id: z.uuid() }),
  z.strictObject({
    type: z.literal("desktop-result"),
    id: z.uuid(),
    callId: z.uuid(),
    result: desktopResultSchema,
  }),
]);
export const workerEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("web-request"),
    id: z.uuid(),
    callId: z.uuid(),
    request: webRequestSchema,
  }),
  z.strictObject({
    type: z.literal("desktop-request"),
    id: z.uuid(),
    callId: z.uuid(),
    request: desktopRequestSchema,
  }),
  z.strictObject({ type: z.literal("tool"), id: z.uuid(), activity: toolActivitySchema }),
  z.strictObject({ type: z.literal("delta"), id: z.uuid(), text: z.string().max(65536) }),
  z.strictObject({ type: z.literal("done"), id: z.uuid() }),
  z.strictObject({ type: z.literal("error"), id: z.uuid(), message: z.string().max(1000) }),
]);
export type WorkerRequest = z.infer<typeof workerRequestSchema>;
export type WorkerEvent = z.infer<typeof workerEventSchema>;
