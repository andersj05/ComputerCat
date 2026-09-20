import { z } from "zod";

export const CLIPBOARD_TEXT_LIMIT = 8000;

export const webUrlSchema = z
  .string()
  .min(1)
  .max(2081)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        /^https?:\/\//i.test(value) &&
        !/\s/.test(value) &&
        !value.includes("\\") &&
        !url.username &&
        !url.password &&
        url.href.length <= 2081 &&
        Boolean(url.hostname)
      );
    } catch {
      return false;
    }
  }, "Use a complete HTTP or HTTPS URL without credentials.");

const pathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes("\0"));

export const desktopUtilitySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("environment") }),
  z.strictObject({ action: z.literal("clipboard-read") }),
  z.strictObject({
    action: z.literal("clipboard-write"),
    text: z.string().min(1).max(CLIPBOARD_TEXT_LIMIT),
  }),
  z.strictObject({ action: z.literal("open-url"), url: webUrlSchema }),
  z.strictObject({ action: z.literal("open-folder"), path: pathSchema }),
  z.strictObject({ action: z.literal("reveal-file"), path: pathSchema }),
]);
export type DesktopUtilityRequest = z.infer<typeof desktopUtilitySchema>;
