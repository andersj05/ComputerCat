import type { ActionResult } from "../shared/contracts";
import { webUrlSchema } from "../shared/desktop-utilities";

/** A user-clicked web link; never a file, executable or custom protocol. */
export async function openWebLink(
  input: unknown,
  openExternal: (url: string) => Promise<void>,
): Promise<ActionResult> {
  const parsed = webUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This is not a supported web link." };
  try {
    await openExternal(new URL(parsed.data).href);
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't open this link. Try again." };
  }
}
