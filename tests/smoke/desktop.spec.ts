import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("desktop companion, isolated bridge, streaming, stop, and new chat", async ({}, testInfo) => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  if (!userData.startsWith(join(tmpdir(), "computercat-smoke-")))
    throw new Error("Unexpected test directory");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.COMPUTERCAT_PACKAGED_EXECUTABLE;
  const electron = await _electron.launch({
    ...(executable ? { executablePath: executable, args: [] } : { args: [resolve(".")] }),
    env: {
      ...env,
      COMPUTERCAT_RUNTIME: "demo",
      COMPUTERCAT_SMOKE_TEST: "1",
      COMPUTERCAT_TEST_USER_DATA: userData,
    },
  });
  try {
    await expect.poll(() => electron.windows().length).toBe(2);
    const page = electron.windows().find((window) => window.url().includes("view=chat"));
    const pet = electron.windows().find((window) => window.url().includes("view=pet"));
    if (!page || !pet) throw new Error("Companion windows did not open");
    await expect(page.getByRole("heading", { name: "Hey, I'm your Computer Cat." })).toBeVisible();
    await expect(page.getByText("DEMO MODE · Sample replies, no API calls")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        require: typeof Reflect.get(window, "require"),
        process: typeof Reflect.get(window, "process"),
      })),
    ).toEqual({ require: "undefined", process: "undefined" });
    await page.screenshot({ path: testInfo.outputPath("welcome.png") });
    await pet.screenshot({ path: testInfo.outputPath("companion.png"), omitBackground: true });
    await page.getByRole("button", { name: "Say hello" }).click();
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeVisible();
    await expect(page.locator(".message.assistant")).toContainText("no API calls are being made");
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
    await page.getByRole("textbox", { name: "Message Computer Cat" }).fill("What can you do?");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.getByRole("button", { name: "Stop reply" }).click();
    await expect(page.locator('[data-state="stopped"]')).toBeVisible();
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page.locator(".message")).toHaveCount(0);
    await page.getByRole("button", { name: "Preferences" }).click();
    await expect(page.getByText("Screen & app access")).toBeVisible();
    await expect(
      page.getByText("A local demo with sample replies.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to desktop" }).click();
    await pet.getByRole("button", { name: "Open Computer Cat chat" }).click();
    await expect(page.getByRole("heading", { name: "Your cat, your space." })).toBeVisible();
  } finally {
    await electron.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test("Pi worker loads in the desktop build and rejects an unknown model without a network call", async () => {
  test.setTimeout(90_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  if (!userData.startsWith(join(tmpdir(), "computercat-smoke-")))
    throw new Error("Unexpected test directory");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.COMPUTERCAT_PACKAGED_EXECUTABLE;
  const electron = await _electron.launch({
    ...(executable ? { executablePath: executable, args: [] } : { args: [resolve(".")] }),
    env: {
      ...env,
      COMPUTERCAT_RUNTIME: "pi",
      COMPUTERCAT_PROVIDER: "__offline_missing_provider__",
      COMPUTERCAT_MODEL: "missing",
      COMPUTERCAT_API_KEY: "test-only-not-a-credential",
      COMPUTERCAT_SMOKE_TEST: "1",
      COMPUTERCAT_TEST_USER_DATA: userData,
    },
  });
  try {
    await expect.poll(() => electron.windows().length).toBe(2);
    const page = electron.windows().find((window) => window.url().includes("view=chat"));
    if (!page) throw new Error("Chat window did not open");
    await page.getByRole("button", { name: "Say hello" }).click();
    await expect(page.locator(".message.assistant")).toContainText(
      "The configured model is unavailable",
      { timeout: 60_000 },
    );
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
  } finally {
    await electron.close();
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
