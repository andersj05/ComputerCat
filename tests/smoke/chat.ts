import { expect, type Page } from "@playwright/test";

export async function composeMessage(page: Page, text: string) {
  // fill() does not wait for an obscuring modal or its asynchronous save to close.
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const input = page.getByRole("textbox", { name: "Message Computer Cat" });
  await input.fill(text);
  await expect(input).toHaveValue(text);
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
}

export async function sendAndWaitForReply(page: Page, text: string) {
  await composeMessage(page, text);
  // Count after any history switch has completed, before sending this turn.
  const replies = page.locator(".message.assistant");
  const index = await replies.count();
  await page.getByRole("button", { name: "Send message" }).click();
  // An absent Stop button or the previous reply can match before IPC accepts this send.
  const reply = replies.nth(index);
  await expect(reply).toHaveAttribute("data-state", "complete", { timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Message Computer Cat" })).toHaveValue("");
  return reply;
}
