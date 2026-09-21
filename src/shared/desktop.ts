import { z } from "zod";
import { desktopUtilitySchema } from "./desktop-utilities";

export const desktopRegionSchema = z
  .strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (region) => region.x + region.width <= 1 && region.y + region.height <= 1,
    "The region must fit inside the source.",
  );
export type DesktopRegion = z.infer<typeof desktopRegionSchema>;
export type DesktopReadMode = "all" | "selection" | "tabs" | "page" | "controls";

// Native IDs are kept behind expiring, opaque source IDs issued by the broker.
export const desktopRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("utility"), request: desktopUtilitySchema }),
  z.strictObject({
    operation: z.literal("observe"),
    sourceId: z.uuid().optional(),
    screenshot: z.boolean(),
  }),
  z.strictObject({ operation: z.literal("list") }),
  z.strictObject({ operation: z.literal("capture"), sourceId: z.uuid() }),
  z.strictObject({
    operation: z.literal("capture-region"),
    sourceId: z.uuid(),
    region: desktopRegionSchema,
  }),
  z.strictObject({ operation: z.literal("read"), sourceId: z.uuid() }),
  z.strictObject({ operation: z.literal("selection"), sourceId: z.uuid().optional() }),
  z.strictObject({ operation: z.literal("tabs"), sourceId: z.uuid().optional() }),
  z.strictObject({ operation: z.literal("page"), sourceId: z.uuid().optional() }),
  z.strictObject({ operation: z.literal("controls"), sourceId: z.uuid().optional() }),
  z.strictObject({
    operation: z.literal("find-text"),
    sourceId: z.uuid().optional(),
    query: z.string().trim().min(1).max(200),
  }),
]);
export type DesktopRequest = z.infer<typeof desktopRequestSchema>;
export const desktopResultSchema = z.strictObject({
  content: z
    .array(
      z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("text"), text: z.string().max(65536) }),
        z.strictObject({
          type: z.literal("image"),
          data: z
            .string()
            .max(8_000_000)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/),
          mimeType: z.literal("image/png"),
        }),
      ]),
    )
    .min(1)
    .max(2),
  isError: z.boolean().optional(),
});
export type DesktopResult = z.infer<typeof desktopResultSchema>;
export type DesktopExecutor = (
  request: DesktopRequest,
  signal: AbortSignal,
) => Promise<DesktopResult>;
export interface DesktopWindowText {
  title: string;
  app: string;
  text: string;
  selectedText: string;
  tabs: string[];
  pages?: { title: string; url?: string }[];
  controls?: { role: string; name: string; enabled: boolean }[];
  truncated: boolean;
  unavailableReason?: string;
}
export function desktopError(text: string): DesktopResult {
  return { content: [{ type: "text", text }], isError: true };
}
