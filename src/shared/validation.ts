import { z } from "zod";

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
