import { mkdir, mkdtemp, rm, rmdir } from "node:fs/promises";
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
  return _electron.launch({
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
}

async function windows(electron: ElectronApplication) {
  await expect.poll(() => electron.windows().length).toBe(2);
  const page = electron.windows().find((window) => window.url().includes("view=chat"));
  const pet = electron.windows().find((window) => window.url().includes("view=pet"));
  if (!page || !pet) throw new Error("Companion windows did not open");
  await expect(page.getByRole("button", { name: "History…" })).toBeEnabled();
  return { page, pet };
}

async function removeTestData(userData: string) {
  if (!userData.startsWith(join(tmpdir(), "computercat-smoke-")))
    throw new Error("Unexpected test directory");
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("XP messenger, keyboard controls, isolated bridge, and conversation lifecycle", async ({}, testInfo) => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    const rendererErrors: string[] = [];
    page.on("pageerror", (error) => rendererErrors.push(error.message));
    pet.on("pageerror", (error) => rendererErrors.push(error.message));
    await expect(page.locator(".statusbar")).toContainText("Demo — no API calls");
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
      await pet.locator(".cat-head").evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    // Verify an actual rendered corner stays transparent, not merely the PNG source.
    expect(
      await electron.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((candidate) =>
          candidate.webContents.getURL().includes("view=pet"),
        );
        return (await window?.webContents.capturePage())?.toBitmap()[3];
      }),
    ).toBe(0);
    await expect(pet.getByRole("status")).toHaveText("");
    await page.screenshot({ path: testInfo.outputPath("welcome.png") });
    await pet.screenshot({ path: testInfo.outputPath("companion.png"), omitBackground: true });

    const input = page.getByRole("textbox", { name: "Message Computer Cat" });
    await page.getByRole("button", { name: "Say hello" }).click();
    await expect(input).toHaveValue("Hey, Computer Cat. Nice to meet you!");
    await expect(page.locator(".message")).toHaveCount(0);
    await expect(input).toBeFocused();
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeVisible();
    await expect(pet.getByRole("status")).toContainText("Thinking");
    await expect(page.getByRole("button", { name: "New conversation" })).toBeDisabled();
    await expect(page.locator(".message.assistant")).toContainText("local demo");
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
    await input.fill("Keep this draft");
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("new-conversation.png") });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".message")).toHaveCount(4);
    await expect(input).toHaveValue("Keep this draft");
    await page.getByRole("button", { name: "New conversation" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(input).toHaveValue("Keep this draft");
    await page.getByRole("button", { name: "New conversation" }).click();
    await page.getByRole("button", { name: "Start new chat" }).click();
    await expect(page.locator(".message")).toHaveCount(0);
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();

    await page.getByRole("button", { name: "Options…" }).click();
    const options = page.getByRole("dialog", { name: "Options", exact: true });
    await expect(page.getByRole("tab", { name: "Desktop cat" })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("options-cat.png") });
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Models", exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "Sign in with ChatGPT" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("options-models.png") });
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "General", exact: true })).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: "General", exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("tabpanel", { name: "General", exact: true })
        .getByText("Local demo", { exact: true }),
    ).toBeVisible();
    await expect(options.getByText("Off", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("options-general.png") });
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Desktop cat" })).toBeFocused();
    await page.getByRole("button", { name: "Find cat", exact: true }).click();
    expect(
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL().includes("view=pet"))
          ?.isVisible(),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(options).toBeHidden();
    await expect(input).toBeFocused();

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
    for (const button of ["Close chat to desktop", "Desktop"]) {
      await page.getByRole("button", { name: button, exact: true }).click();
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
    }

    await electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("view=chat"))
        ?.setSize(500, 420),
    );
    await expect(input).toBeInViewport();
    await expect(page.getByRole("button", { name: "Send message" })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("welcome-small.png") });
    await page.getByRole("button", { name: "Options…" }).click();
    await expect(options.getByRole("button", { name: "OK", exact: true })).toBeInViewport();
    for (const tab of ["Desktop cat", "Models", "General"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      expect(
        await options.evaluate(
          (element) =>
            element.scrollWidth <= element.clientWidth &&
            element.scrollHeight <= element.clientHeight,
        ),
      ).toBe(true);
      if (tab === "Models")
        await page.screenshot({ path: testInfo.outputPath("models-small.png") });
      expect(
        await page
          .getByRole("tabpanel", { name: tab, exact: true })
          .evaluate(
            (element) =>
              element.scrollWidth <= element.clientWidth &&
              element.scrollHeight <= element.clientHeight,
          ),
      ).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath("options-small.png") });
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

test("Options stage, cancel, apply, and persist cat settings alongside saved chat", async () => {
  test.setTimeout(90_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  let electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    const saved = () => page.evaluate(async () => (await window.computerCat.info()).preferences);
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("radio", { name: "Small", exact: true }).check();
    await page.getByRole("checkbox", { name: "Always on top" }).uncheck();
    expect(await saved()).toEqual({ size: "medium", animation: true, alwaysOnTop: true });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Options…" }).click();
    await expect(page.getByRole("radio", { name: "Medium", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Always on top" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    await page.getByRole("radio", { name: "Small", exact: true }).check();
    await page.getByRole("checkbox", { name: "Always on top" }).uncheck();
    await page.getByRole("checkbox", { name: "Animate cat" }).uncheck();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    expect(await saved()).toEqual({ size: "small", animation: false, alwaysOnTop: false });
    await expect(pet.locator(".pet-wrap")).not.toHaveClass(/animated/);
    // Windows rounds frameless window bounds at fractional display scales.
    expect(
      await electron.evaluate(({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes("view=pet"),
        );
        return {
          sizeMatches: pet
            ?.getSize()
            .every((value, index) => Math.abs(value - (index === 0 ? 148 : 244)) <= 1),
          onTop: pet?.isAlwaysOnTop(),
        };
      }),
    ).toEqual({ sizeMatches: true, onTop: false });
    await page.getByRole("radio", { name: "Medium", exact: true }).check();
    await page.keyboard.press("Escape");
    expect(await saved()).toEqual({ size: "small", animation: false, alwaysOnTop: false });
    await page.getByRole("button", { name: "Options…" }).click();
    await expect(page.getByRole("radio", { name: "Small", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Large", exact: true }).check();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("textbox", { name: "Message Computer Cat" }).fill("Hello");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.getByRole("button", { name: "Stop reply" }).click();
    await electron.close();
    electron = await launch(userData);
    const restored = await windows(electron);
    expect(
      await restored.page.evaluate(async () => (await window.computerCat.info()).preferences),
    ).toEqual({ size: "large", animation: false, alwaysOnTop: false });
    await expect(restored.page.locator(".message")).toHaveCount(2);
    await expect(restored.page.locator(".message.user")).toContainText("Hello");
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

test("Options keep a failed draft available for retry without changing the live cat", async () => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const obstruction = join(userData, "preferences.json.tmp");
  await mkdir(obstruction);
  const electron = await launch(userData);
  try {
    const { page } = await windows(electron);
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("radio", { name: "Large", exact: true }).check();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    const options = page.getByRole("dialog", { name: "Options", exact: true });
    await expect(options.getByRole("alert")).toContainText("Couldn't save");
    await expect(options.getByRole("alert")).not.toContainText(userData);
    await expect(page.getByRole("radio", { name: "Large", exact: true })).toBeChecked();
    expect(
      await page.evaluate(async () => (await window.computerCat.info()).preferences.size),
    ).toBe("medium");
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
    await rmdir(obstruction);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    await expect(options.getByRole("alert")).toBeHidden();
    expect(
      await page.evaluate(async () => (await window.computerCat.info()).preferences.size),
    ).toBe("large");
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("cat presence, direct controls, drag gestures, and motion preferences", async ({}, testInfo) => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    const petState = () =>
      electron.evaluate(({ BrowserWindow }) => {
        const cat = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes("view=pet"),
        );
        const chat = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes("view=chat"),
        );
        return {
          bounds: cat?.getBounds(),
          onTop: cat?.isAlwaysOnTop(),
          chatVisible: chat?.isVisible(),
          chatFocused: chat?.isFocused(),
        };
      });
    expect(
      await page.evaluate(() =>
        window.computerCat.dragPet("start").then(
          () => "allowed",
          () => "denied",
        ),
      ),
    ).toBe("denied");
    expect(
      await pet.evaluate(() =>
        window.computerCat.dragPet({ x: 4 } as never).then(
          () => "allowed",
          () => "denied",
        ),
      ),
    ).toBe("denied");
    await pet.emulateMedia({ reducedMotion: "no-preference" });
    expect(
      await pet.locator(".cat-head").evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("cat-look");
    expect(
      await pet
        .locator(".cat-blink")
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("cat-blink");
    await pet.screenshot({ path: testInfo.outputPath("cat-idle.png"), omitBackground: true });
    await pet.locator(".cat-blink").evaluate((element) => {
      const animation = element.getAnimations()[0];
      if (animation) {
        animation.pause();
        animation.currentTime = 2992;
      }
    });
    await pet.screenshot({ path: testInfo.outputPath("cat-blink.png"), omitBackground: true });
    await pet.locator(".cat-blink").evaluate((element) => element.getAnimations()[0]?.play());

    // Simulate losing topmost status while another app-owned window has typing focus.
    await electron.evaluate(({ BrowserWindow }) => {
      const chat = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes("view=chat"),
      );
      const cat = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes("view=pet"),
      );
      chat?.maximize();
      chat?.focus();
      cat?.setAlwaysOnTop(false);
    });
    await expect.poll(async () => (await petState()).onTop).toBe(true);
    expect((await petState()).chatFocused).toBe(true);
    await page.getByRole("button", { name: "Desktop", exact: true }).click();
    await pet.getByRole("button", { name: "Cat options" }).click();
    await expect(page.getByRole("dialog", { name: "Options", exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Always on top" }).uncheck();
    await page.getByRole("checkbox", { name: "Animate cat" }).uncheck();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    // Cross at least one recovery tick to prove opting out is respected.
    await new Promise((resolve) => setTimeout(resolve, 2200));
    expect((await petState()).onTop).toBe(false);
    expect(
      await pet.locator(".cat-head").evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.getByRole("checkbox", { name: "Always on top" }).check();
    await page.getByRole("checkbox", { name: "Animate cat" }).check();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await electron.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes("view=pet"))
        ?.setPosition(-10000, -10000);
    });
    // A display change also recovers an off-screen pet without focusing it.
    await electron.evaluate(({ screen }) =>
      screen.emit("display-metrics-changed", {}, screen.getPrimaryDisplay(), ["workArea"]),
    );
    expect(
      await electron.evaluate(({ BrowserWindow, screen }) => {
        const bounds = BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes("view=pet"))
          ?.getBounds();
        if (!bounds) return false;
        const area = screen.getDisplayMatching(bounds).workArea;
        return (
          bounds.x >= area.x &&
          bounds.y >= area.y &&
          bounds.x + bounds.width <= area.x + area.width + 1 &&
          bounds.y + bounds.height <= area.y + area.height + 1
        );
      }),
    ).toBe(true);
    await electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes("view=pet"))
        ?.setPosition(-10000, -10000),
    );
    await page.getByRole("button", { name: "Find cat", exact: true }).click();
    await expect
      .poll(() =>
        electron.evaluate(({ BrowserWindow, screen }) => {
          const bounds = BrowserWindow.getAllWindows()
            .find((win) => win.webContents.getURL().includes("view=pet"))
            ?.getBounds();
          const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
          return bounds &&
            bounds.x >= area.x &&
            bounds.y >= area.y &&
            bounds.x + bounds.width <= area.x + area.width + 1 &&
            bounds.y + bounds.height <= area.y + area.height + 1
            ? "inside"
            : JSON.stringify({ bounds, area });
        }),
      )
      .toBe("inside");
    expect((await petState()).chatFocused).toBe(true);
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByRole("button", { name: "Desktop", exact: true }).click();

    // Supply desktop cursor coordinates inside this isolated app. Never move the user's mouse.
    await electron.evaluate(({ screen }) => {
      screen.getCursorScreenPoint = () => ({ x: 500, y: 500 });
    });
    const before = (await petState()).bounds;
    if (!before) throw new Error("Missing cat bounds");
    await pet.mouse.move(80, 120);
    await pet.mouse.down();
    await pet.evaluate(() => window.computerCat.info());
    await electron.evaluate(({ screen }) => {
      screen.getCursorScreenPoint = () => ({ x: 440, y: 460 });
    });
    await pet.mouse.move(78, 118);
    await expect.poll(async () => (await petState()).bounds?.x).toBeCloseTo(before.x - 60, -1);
    // Repeated position updates must not grow a frameless window at fractional DPI.
    for (let step = 0; step < 6; step++) {
      await electron.evaluate(({ screen }, step) => {
        screen.getCursorScreenPoint = () => ({ x: 440 + step, y: 460 });
      }, step);
      await pet.mouse.move(79 + step, 118);
      await pet.evaluate(() => window.computerCat.info());
    }
    const moved = (await petState()).bounds;
    if (!moved) throw new Error("Missing moved bounds");
    expect(Math.abs(moved.width - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(moved.height - before.height)).toBeLessThanOrEqual(1);
    await pet.mouse.up();
    await pet.evaluate(() => window.computerCat.info());
    expect((await petState()).chatVisible).toBe(false);
    await pet.mouse.down();
    await pet.evaluate(() => window.computerCat.info());
    await electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes("view=pet"))
        ?.emit("blur"),
    );
    await pet.mouse.up();
    await pet.evaluate(() => window.computerCat.info());
    expect((await petState()).chatVisible).toBe(false);
    await pet.getByRole("button", { name: "Open Computer Cat chat" }).click();
    await expect.poll(async () => (await petState()).chatVisible).toBe(true);

    for (const size of ["Small", "Medium", "Large"]) {
      await pet.getByRole("button", { name: "Cat options" }).click();
      await page.getByRole("radio", { name: size, exact: true }).check();
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.getByRole("textbox", { name: "Message Computer Cat" }).fill("Hello");
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(pet.getByRole("button", { name: "Stop reply" })).toBeVisible();
      expect(
        await pet
          .locator(".cat-head")
          .evaluate((element) => getComputedStyle(element).animationName),
      ).toBe("cat-think");
      expect(
        await pet
          .locator(".pet-dock")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await pet.screenshot({
        path: testInfo.outputPath(`cat-thinking-${size.toLowerCase()}.png`),
        omitBackground: true,
      });
      await pet.getByRole("button", { name: "Stop reply" }).click();
      await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
    }
    await pet.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await pet
        .locator(".pet-art")
        .evaluate((element) => element.getAnimations({ subtree: true }).length),
    ).toBe(0);
    await pet.screenshot({ path: testInfo.outputPath("cat-still.png"), omitBackground: true });
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});
