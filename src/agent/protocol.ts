import { z } from "zod";
import { reasoningSchema } from "../shared/validation";

export const workerConfigSchema = z.strictObject({
  mode: z.literal("pi"),
  provider: z.string().min(1).max(128),
  model: z.string().min(1).max(120),
  apiKey: z.string().min(1).max(32768),
  reasoning: reasoningSchema.default("medium"),
});

export const workerRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("run"),
    id: z.uuid(),
    prompt: z.string().min(1).max(6000),
    config: workerConfigSchema,
  }),
  z.strictObject({ type: z.literal("stop"), id: z.uuid() }),
]);
export const workerEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("delta"), id: z.uuid(), text: z.string().max(65536) }),
  z.strictObject({ type: z.literal("done"), id: z.uuid() }),
  z.strictObject({ type: z.literal("error"), id: z.uuid(), message: z.string().max(1000) }),
]);
export type WorkerRequest = z.infer<typeof workerRequestSchema>;
export type WorkerEvent = z.infer<typeof workerEventSchema>;
