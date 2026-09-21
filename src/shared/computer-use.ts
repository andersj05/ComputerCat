import { z } from "zod";

export const computerKeys = [
  "Tab",
  "Shift+Tab",
  "Escape",
  "Enter",
  "Space",
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Control+A",
  "Control+Z",
  "Control+Y",
] as const;
const elementId = z.string().regex(/^e[1-9]\d{0,2}$/);
const text = z
  .string()
  .max(8000)
  .refine(
    (value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        if (code >= 0xd800 && code <= 0xdfff) return character.length === 2;
        return (code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13;
      }),
    "Text must be valid Unicode without control characters other than tabs and newlines.",
  );
export const computerActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("click"), elementId }),
  z.strictObject({ kind: z.literal("fill"), elementId, text }),
  z.strictObject({
    kind: z.literal("type"),
    elementId,
    text: text.refine((value) => value.length > 0),
  }),
  z.strictObject({ kind: z.literal("key"), elementId, key: z.enum(computerKeys) }),
  z.strictObject({
    kind: z.literal("scroll"),
    elementId,
    direction: z.enum(["up", "down", "left", "right"]),
    amount: z.enum(["small", "large"]),
  }),
]);
export type ComputerAction = z.infer<typeof computerActionSchema>;

// Internal native observations never cross the model/renderer boundary intact.
const bounds = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().nonnegative().finite(),
  height: z.number().nonnegative().finite(),
});
const handle = z.string().regex(/^[1-9]\d{0,18}$/);
export const computerElementSchema = z.strictObject({
  runtimeId: z.array(z.int()).min(1).max(32),
  name: z.string().max(512),
  role: z.string().max(40),
  enabled: z.boolean(),
  bounds,
  signature: z.string().length(64),
  actions: z.array(z.enum(["click", "fill", "type", "key", "scroll"])).max(5),
  value: z.string().max(8000).optional(),
});
export const computerSnapshotSchema = z.strictObject({
  windowHandle: handle,
  processId: z.int().positive(),
  processStarted: z.string().regex(/^\d+$/),
  foreground: z.string().regex(/^\d+$/),
  lastInput: z.number().int().min(0).max(0xffffffff),
  title: z.string().max(512),
  app: z.string().max(120),
  bounds,
  text: z.string().max(12000),
  truncated: z.boolean(),
  elements: z.array(computerElementSchema).max(60),
});
export type ComputerSnapshot = z.infer<typeof computerSnapshotSchema>;
export type ComputerElement = z.infer<typeof computerElementSchema>;

export const computerOutcomeSchema = z.strictObject({
  status: z.enum(["rejected", "dispatched", "uncertain"]),
  reason: z.enum(["ok", "stale", "user-input", "unavailable", "unsupported", "focus", "failed"]),
  snapshot: computerSnapshotSchema.optional(),
});
export type ComputerOutcome = z.infer<typeof computerOutcomeSchema>;
