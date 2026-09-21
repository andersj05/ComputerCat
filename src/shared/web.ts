import { z } from "zod";

export const webRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("status") }),
  z.strictObject({
    operation: z.literal("read-many"),
    urls: z.array(z.string().min(1).max(4096)).min(1).max(3),
  }),
  z.strictObject({
    operation: z.literal("links"),
    pageId: z.uuid(),
    start: z.number().int().min(0).max(200).default(0),
    query: z.string().trim().min(1).max(200).optional(),
  }),
  z.strictObject({
    operation: z.literal("follow"),
    pageId: z.uuid(),
    index: z.number().int().min(0).max(199),
  }),
  z.strictObject({ operation: z.literal("metadata"), pageId: z.uuid() }),
  z.strictObject({ operation: z.literal("feed"), url: z.string().min(1).max(4096) }),
  z.strictObject({ operation: z.literal("read"), url: z.string().min(1).max(4096) }),
  z.strictObject({
    operation: z.literal("page"),
    pageId: z.uuid(),
    start: z.number().int().min(0).max(100_000),
  }),
  z.strictObject({
    operation: z.literal("find"),
    pageId: z.uuid(),
    query: z.string().trim().min(1).max(200),
  }),
  z.strictObject({ operation: z.literal("search"), query: z.string().trim().min(1).max(600) }),
]);
export type WebRequest = z.infer<typeof webRequestSchema>;
export const webResultSchema = z.strictObject({
  content: z
    .array(z.strictObject({ type: z.literal("text"), text: z.string().max(131072) }))
    .length(1),
  isError: z.boolean().optional(),
});
export type WebResult = z.infer<typeof webResultSchema>;
export type WebExecutor = (request: WebRequest, signal: AbortSignal) => Promise<WebResult>;
export const webError = (text: string): WebResult => ({
  content: [{ type: "text", text }],
  isError: true,
});
