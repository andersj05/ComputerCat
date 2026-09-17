import { expect, type Page } from "@playwright/test";

export async function sendAndWaitForReply(page: Page, text: string) {
  const replies = page.locator(".message.assistant");
  const index = await replies.count();
  const input = page.getByRole("textbox", { name: "Message Computer Cat" });
  await input.fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  // An absent Stop button or the previous reply can match before IPC accepts this send.
  const reply = replies.nth(index);
  await expect(reply).toHaveAttribute("data-state", "complete", { timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
  await expect(input).toHaveValue("");
  return reply;
}
