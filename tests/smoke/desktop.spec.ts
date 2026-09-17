import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect, test } from "@playwright/test";

async function launch(userData: string, mode: "demo" | "pi" = "demo") {
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
      COMPUTERCAT_RUNTIME: mode,
      COMPUTERCAT_PROVIDER: "__offline_missing_provider__",
      COMPUTERCAT_MODEL: "missing",
      COMPUTERCAT_API_KEY: "test-only-not-a-credential",
      COMPUTERCAT_SMOKE_TEST: "1",
      COMPUTERCAT_TEST_USER_DATA: userData,
    },
  });
  return electron;
}

async function windows(electron: ElectronApplication) {
  await expect.poll(() => electron.windows().length).toBe(2);
  const page = electron.windows().find((window) => window.url().includes("view=chat"));
  const pet = electron.windows().find((window) => window.url().includes("view=pet"));
  if (!page || !pet) throw new Error("Companion windows did not open");
  await expect(page.getByRole("button", { name: "Say hello" })).toBeEnabled();
  return { page, pet };
}

async function removeTestData(userData: string) {
  if (!userData.startsWith(join(tmpdir(), "computercat-smoke-")))
    throw new Error("Unexpected test directory");
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("XP workspace, companion controls, isolated bridge, and conversation lifecycle", async ({}, testInfo) => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    // Windows rounds frameless window bounds at fractional display scales.
    const rendererErrors: string[] = [];
    page.on("pageerror", (error) => rendererErrors.push(error.message));
    pet.on("pageerror", (error) => rendererErrors.push(error.message));
    await expect(
      page.getByRole("heading", { name: "A little company. A little help." }),
    ).toBeVisible();
    await expect(page.locator(".composer-footer")).toContainText("No API calls");
    expect(
      await page.evaluate(() => ({
        require: typeof Reflect.get(window, "require"),
        process: typeof Reflect.get(window, "process"),
      })),
    ).toEqual({ require: "undefined", process: "undefined" });
    expect(
      await page.evaluate(() =>
        window.computerCat.updatePreferences({ size: "invalid", shell: true } as never),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await pet.evaluate(() =>
        window.computerCat.updatePreferences({ size: "small" }).then(
          () => "allowed",
          () => "denied",
        ),
      ),
    ).toBe("denied");
    expect(
      await pet.evaluate(() =>
        window.computerCat.minimizeChat().then(
          () => "allowed",
          () => "denied",
        ),
      ),
    ).toBe("denied");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await pet.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await pet
        .locator(".pet-button img")
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.screenshot({ path: testInfo.outputPath("welcome.png") });
    await pet.screenshot({ path: testInfo.outputPath("companion.png"), omitBackground: true });

    await page.getByRole("button", { name: "Say hello" }).click();
    const input = page.getByRole("textbox", { name: "Message Computer Cat" });
    await expect(input).toHaveValue("Hey, Computer Cat. Nice to meet you!");
    await expect(page.locator(".message")).toHaveCount(0);
    await expect(input).toBeFocused();
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeVisible();
    await expect(pet.getByRole("status")).toContainText("Thinking");
    await expect(page.getByRole("button", { name: "New conversation" })).toBeDisabled();
    await expect(page.locator(".message.assistant")).toContainText("no API calls are being made");
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("conversation.png") });
    await input.fill("First line");
    await input.press("Shift+Enter");
    await input.pressSequentially("Second line");
    await expect(input).toHaveValue("First line\nSecond line");
    await page.getByRole("button", { name: "Send message" }).click();
    await pet.getByRole("button", { name: "Stop reply" }).click();
    await expect(page.locator('[data-state="stopped"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();

    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("new-conversation.png") });
    await page.getByRole("button", { name: "Keep chatting" }).click();
    await expect(page.locator(".message")).toHaveCount(4);
    await page.getByRole("button", { name: "New conversation" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator(".message")).toHaveCount(4);
    await page.getByRole("button", { name: "New conversation" }).click();
    await page.getByRole("button", { name: "Start new chat" }).click();
    await expect(page.locator(".message")).toHaveCount(0);
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();

    await page.getByRole("button", { name: "My cat", exact: true }).click();
    await page.getByRole("radio", { name: "Small", exact: true }).check();
    await expect
      .poll(() =>
        electron.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes("view=pet"))
            ?.getSize()
            .every((value, index) => Math.abs(value - (index === 0 ? 148 : 244)) <= 1),
        ),
      )
      .toBe(true);
    await page.getByRole("checkbox", { name: "Keep cat on top" }).uncheck();
    await expect
      .poll(() =>
        electron.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes("view=pet"))
            ?.isAlwaysOnTop(),
        ),
      )
      .toBe(false);
    await page.getByRole("checkbox", { name: "A little animation" }).uncheck();
    await expect(pet.locator(".pet-wrap")).not.toHaveClass(/animated/);
    await page.getByRole("radio", { name: "Medium", exact: true }).check();
    await page.getByRole("checkbox", { name: "Keep cat on top" }).check();
    await page.screenshot({ path: testInfo.outputPath("my-cat.png") });
    await page.getByRole("button", { name: "Find my cat" }).click();
    await expect(page.locator(".statusbar")).toContainText("Your cat is on the desktop");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByText("Screen & app access is off.", { exact: false })).toBeVisible();
    await expect(
      page.getByText("A local demo with sample replies.", { exact: false }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("settings.png") });
    await page.getByRole("button", { name: "Maximize window" }).click();
    await expect(page.getByRole("button", { name: "Restore window" })).toBeVisible();
    await page.getByRole("button", { name: "Restore window" }).click();
    await expect(page.getByRole("button", { name: "Maximize window" })).toBeVisible();
    await page.getByRole("button", { name: "Minimize window" }).click();
    await expect
      .poll(() =>
        electron.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes("view=chat"))
            ?.isMinimized(),
        ),
      )
      .toBe(true);
    await pet.getByRole("button", { name: "Open Computer Cat chat" }).click();
    await expect
      .poll(() =>
        electron.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes("view=chat"))
            ?.isMinimized(),
        ),
      )
      .toBe(false);
    await page.getByRole("button", { name: "Close chat to desktop" }).click();
    await expect
      .poll(() =>
        electron.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes("view=chat"))
            ?.isVisible(),
        ),
      )
      .toBe(false);
    await pet.getByRole("button", { name: "Open Computer Cat chat" }).click();
    await expect
      .poll(() =>
        electron.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes("view=chat"))
            ?.isVisible(),
        ),
      )
      .toBe(true);
    await expect(page.getByRole("heading", { name: "Simple by nature." })).toBeVisible();

    await electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("view=chat"))
        ?.setSize(720, 580),
    );
    await page.screenshot({ path: testInfo.outputPath("settings-small.png") });
    await page.getByRole("button", { name: "My cat", exact: true }).click();
    expect(
      await page
        .locator(".page-content")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("my-cat-small.png") });
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(input).toBeInViewport();
    await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("welcome-small.png") });
    expect(rendererErrors).toEqual([]);
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

test("Pi worker rejects an unknown model without a network call and leaves the UI usable", async () => {
  test.setTimeout(90_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData, "pi");
  try {
    const { page } = await windows(electron);
    await page.getByRole("button", { name: "Say hello" }).click();
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".message.assistant")).toContainText(
      "The configured model is unavailable",
      { timeout: 60_000 },
    );
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
    await expect(page.getByRole("button", { name: "New conversation" })).toBeEnabled();
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

test("cat preferences survive restart while conversations stay session-only", async () => {
  test.setTimeout(90_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  let electron = await launch(userData);
  try {
    const { page } = await windows(electron);
    expect(
      await page.evaluate(() =>
        window.computerCat.updatePreferences({
          size: "large",
          animation: false,
          alwaysOnTop: false,
        }),
      ),
    ).toEqual({ ok: true });
    await page.getByRole("textbox", { name: "Message Computer Cat" }).fill("Hello");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.getByRole("button", { name: "Stop reply" }).click();
    await electron.close();
    electron = await launch(userData);
    const restored = await windows(electron);
    expect(
      await restored.page.evaluate(async () => (await window.computerCat.info()).preferences),
    ).toEqual({ size: "large", animation: false, alwaysOnTop: false });
    await expect(restored.page.locator(".message")).toHaveCount(0);
    await expect(restored.pet.locator(".pet-wrap")).not.toHaveClass(/animated/);
    expect(
      await electron.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes("view=pet"),
        );
        return {
          sizeMatches: pet
            ?.getSize()
            .every((value, index) => Math.abs(value - (index === 0 ? 228 : 352)) <= 4),
          onTop: pet?.isAlwaysOnTop(),
        };
      }),
    ).toEqual({ sizeMatches: true, onTop: false });
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});
