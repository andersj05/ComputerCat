import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { sendAndWaitForReply, showCatControls } from "./chat";

async function launch(userData: string) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    COMPUTERCAT_SMOKE_TEST: "1",
    COMPUTERCAT_TEST_USER_DATA: userData,
    COMPUTERCAT_RUNTIME: "demo",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.COMPUTERCAT_PACKAGED_EXECUTABLE;
  const electron = await _electron.launch({
    ...(executable ? { executablePath: executable, args: [] } : { args: [resolve(".")] }),
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  });
  await expect.poll(() => electron.windows().length).toBe(2);
  const page = electron.windows().find((window) => window.url().includes("view=chat"));
  const pet = electron.windows().find((window) => window.url().includes("view=pet"));
  if (!page || !pet) throw new Error("Missing windows");
  await expect(page.getByRole("button", { name: "History…" })).toBeEnabled();
  return { electron, page, pet };
}

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("history survives restart, resumes drafts, and deletes only the chosen conversation", async ({}, testInfo) => {
  test.setTimeout(90_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-history-smoke-"));
  let app = await launch(userData);
  try {
    let page = app.page;
    await sendAndWaitForReply(page, "first saved chat");
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page.locator(".message")).toHaveCount(0);
    await sendAndWaitForReply(page, "second saved chat");
    const input = page.getByRole("textbox", { name: "Message Computer Cat" });
    await input.fill("second chat draft");
    await page.getByRole("button", { name: "History…" }).click();
    await expect(page.locator(".history-item")).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("history.png") });
    await page.getByRole("searchbox", { name: "Find a conversation:" }).fill("first");
    await expect(page.locator(".history-item")).toHaveCount(1);
    await page.locator(".history-item").click();
    await page.getByRole("button", { name: "Open conversation", exact: true }).click();
    await expect(page.locator(".message.user")).toHaveText("You:first saved chat");
    await expect(input).toHaveValue("");
    await page.getByRole("button", { name: "History…" }).click();
    await page.getByRole("button", { name: /second saved chat/ }).click();
    await page.getByRole("button", { name: "Open conversation", exact: true }).click();
    await expect(input).toHaveValue("second chat draft");
    expect(
      await app.pet.evaluate(() =>
        window.computerCat.openConversation("../outside").then(
          () => "allowed",
          () => "denied",
        ),
      ),
    ).toBe("denied");
    expect(
      await page.evaluate(() => window.computerCat.openConversation("../outside")),
    ).toMatchObject({ ok: false });
    await showCatControls(app.pet);
    await app.pet.getByRole("button", { name: "Choose model" }).click();
    await expect(page.getByRole("dialog", { name: "Choose model" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("pet-model-picker.png") });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Connections…" }).click();
    await expect(page.getByRole("tab", { name: "Models", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");

    await app.electron.close();
    app = await launch(userData);
    page = app.page;
    await expect(page.locator(".message.user")).toContainText("second saved chat");
    await page.getByRole("button", { name: "History…" }).click();
    await page.getByRole("button", { name: /first saved chat/ }).click();
    await page.getByRole("button", { name: "Delete…" }).click();
    await page.getByRole("button", { name: "Keep conversation" }).click();
    await expect(page.locator(".history-item")).toHaveCount(2);
    await page.getByRole("button", { name: "Delete…" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.locator(".history-item")).toHaveCount(1);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    expect(
      (await readdir(join(userData, "conversations"))).filter((file) => file.endsWith(".json")),
    ).toHaveLength(1);
    await app.electron.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("view=chat"))
        ?.setSize(500, 420);
    });
    await page.screenshot({ path: testInfo.outputPath("history-restored-small.png") });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  } finally {
    await app.electron.close();
    if (userData.startsWith(join(tmpdir(), "computercat-history-smoke-")))
      await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
