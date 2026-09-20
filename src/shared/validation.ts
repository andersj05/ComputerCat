import { z } from "zod";

export const petDragSchema = z.enum(["start", "move", "end", "cancel"]);
export const petResizeSchema = z.union([
  z.strictObject({ phase: z.literal("start"), edge: z.enum(["top", "left", "top-left"]) }),
  z.strictObject({ phase: z.enum(["move", "end", "cancel"]) }),
  z.strictObject({
    phase: z.literal("step"),
    axis: z.enum(["width", "height"]),
    delta: z.union([z.literal(-40), z.literal(-10), z.literal(10), z.literal(40)]),
  }),
]);

export const reasoningSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
export const modelSettingsSchema = z.strictObject({
  source: z.enum(["demo", "codex", "environment"]),
  codexModel: z.string().min(1).max(120),
  reasoning: reasoningSchema,
});
export const loginRequestSchema = z.strictObject({ method: z.enum(["browser", "device_code"]) });
export const loginAttemptSchema = z.strictObject({ attemptId: z.uuid() });
export const loginCodeSchema = loginAttemptSchema.extend({
  code: z.string().trim().min(1).max(4096),
});

export const sendRequestSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().trim().min(1).max(6000),
});

export const petPreferencesSchema = z.strictObject({
  size: z.enum(["small", "medium", "large"]),
  alwaysOnTop: z.boolean(),
  animation: z.boolean(),
});

export const preferencesPatchSchema = petPreferencesSchema
  .partial()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined));
