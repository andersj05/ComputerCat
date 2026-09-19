import { mkdir, mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect, test } from "@playwright/test";
import { PET_ACTIVITIES, type PetActivity } from "../../src/renderer/src/pet-activity";
import { type ChatSnapshot, IPC } from "../../src/shared/contracts";
import { DEFAULT_VOICE, type VoiceSnapshot } from "../../src/shared/voice";
import { composeMessage, showCatControls } from "./chat";

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("Markdown replies format while streaming and fit a narrow chat", async ({}, testInfo) => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData);
  try {
    const { page } = await windows(electron);
    const publish = async (text: string, busy: boolean) => {
      await electron.evaluate(
        ({ BrowserWindow }, { channel, text, busy }) => {
          BrowserWindow.getAllWindows()
            .find((win) => win.webContents.getURL().includes("view=chat"))
            ?.webContents.send(channel, {
              busy,
              messages: [
                {
                  id: "markdown-fixture",
                  role: "assistant",
                  text,
                  state: busy ? "streaming" : "complete",
                },
              ],
            });
        },
        { channel: IPC.changed, text, busy },
      );
    };
    await publish("**Starting", true);
    await expect(page.locator(".message.assistant")).toContainText("Starting");
    await publish(
      "## A small plan\n\n**Bold** and *italic*, with `inline code`.\n\n- First item\n- Second item\n  - Nested item\n\n1. Start\n2. Finish\n\n> A helpful note\n\n```js\nconst greeting = 'Hello';\n```\n\n| Task | Status |\n| --- | --- |\n| Formatting | Done |\n\n![No remote load](https://example.com/image.png)",
      false,
    );
    await expect(page.locator(".markdown-message strong")).toHaveText("Bold");
    await expect(page.locator(".markdown-message ul li")).toHaveCount(3);
    await expect(page.locator(".markdown-message ol li")).toHaveCount(2);
    await expect(page.locator(".markdown-message pre code")).toContainText("const greeting");
    await expect(page.locator(".markdown-message table")).toBeVisible();
    await expect(page.locator(".markdown-message img")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("markdown.png") });
    await electron.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes("view=chat"))
        ?.setSize(500, 420);
    });
    await publish(`\`\`\`text\n${"long_code_".repeat(100)}\n\`\`\``, false);
    expect(
      await page
        .locator(".messages")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("markdown-narrow.png") });
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

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
test("cat activities follow real snapshots, interrupt completion, and preserve motion controls", async ({}, testInfo) => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    const errors: string[] = [];
    pet.on("pageerror", (error) => errors.push(error.message));
    await pet.emulateMedia({ reducedMotion: "no-preference" });
    const art = pet.locator(".pet-art");
    const base: ChatSnapshot = { conversationId: "motion-fixture", messages: [], busy: false };
    const stream: ChatSnapshot = {
      ...base,
      busy: true,
      messages: [{ id: "motion-reply", role: "assistant", state: "streaming", text: "" }],
    };
    const reply: ChatSnapshot = {
      ...stream,
      messages: stream.messages.map((message) => ({ ...message, text: "Here is your answer." })),
    };
    const completed: ChatSnapshot = {
      ...reply,
      busy: false,
      messages: reply.messages.map((message) => ({ ...message, state: "complete" })),
    };
    let revision = 1000;
    const publish = async (chat: ChatSnapshot, voice: Partial<VoiceSnapshot> = {}) => {
      await electron.evaluate(
        ({ BrowserWindow }, payload) => {
          const target = BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().includes("view=pet"),
          );
          target?.webContents.send(payload.chatChannel, payload.chat);
          target?.webContents.send(payload.voiceChannel, payload.voice);
        },
        {
          chatChannel: IPC.changed,
          voiceChannel: IPC.voiceChanged,
          chat,
          voice: {
            phase: "idle",
            availability: "ready",
            elapsedMs: 0,
            ...voice,
            revision: revision++,
          },
        },
      );
    };
    const poses: { activity: PetActivity; chat?: ChatSnapshot; voice?: Partial<VoiceSnapshot> }[] =
      [
        { activity: "idle" },
        { activity: "preparing", voice: { phase: "starting" } },
        { activity: "listening", voice: { phase: "recording" } },
        { activity: "transcribing", voice: { phase: "finalizing" } },
        { activity: "transcribing", voice: { phase: "transcribing" } },
        { activity: "review", voice: { phase: "review" } },
        { activity: "stopping", voice: { phase: "cancelling" } },
        { activity: "error", voice: { error: "device-missing" } },
        { activity: "thinking", chat: stream },
        {
          activity: "working",
          chat: {
            ...reply,
            messages: reply.messages.map((message) => ({
              ...message,
              tools: [{ id: "reading", name: "read", state: "running" }],
            })),
          },
        },
        { activity: "replying", chat: reply },
      ];
    for (const size of ["small", "medium", "large"] as const) {
      await page.evaluate((size) => window.computerCat.updatePreferences({ size }), size);
      await expect(pet.locator(".pet-wrap")).toHaveCSS(
        "width",
        `${{ small: 148, medium: 188, large: 228 }[size]}px`,
      );
      // Native window resizing finishes after the preference broadcast at fractional DPI.
      await expect
        .poll(async () =>
          Math.abs(
            (await pet.evaluate(() => innerWidth)) - { small: 148, medium: 188, large: 228 }[size],
          ),
        )
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () =>
          Math.abs(
            (await pet.evaluate(() => innerHeight)) - { small: 244, medium: 298, large: 352 }[size],
          ),
        )
        .toBeLessThanOrEqual(1);
      const bounds = await art.boundingBox();
      for (const pose of poses) {
        await publish(pose.chat ?? base, pose.voice);
        await expect(art).toHaveAttribute("data-activity", pose.activity);
        if (pose.activity !== "idle") {
          await expect(pet.locator(".pet-bubble")).toContainText(
            PET_ACTIVITIES[pose.activity].label,
          );
        }
        await expect(pet.getByRole("button", { name: "Show cat controls" })).toHaveAttribute(
          "aria-expanded",
          "false",
        );
        const currentBounds = await art.boundingBox();
        if (!bounds || !currentBounds) throw new Error("Missing artwork bounds");
        for (const dimension of ["x", "y", "width", "height"] as const) {
          expect(currentBounds[dimension]).toBeCloseTo(bounds[dimension], 1);
        }
        const samples = await art.evaluate((element) => {
          const animations = element.getAnimations({ subtree: true });
          const head = element.querySelector(".cat-head");
          if (!head) throw new Error("Missing cat head");
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = 0;
          }
          const before = getComputedStyle(head).transform;
          const headDuration = Number(
            head.getAnimations()[0]?.effect?.getTiming().duration ?? 2400,
          );
          for (const animation of animations) animation.currentTime = headDuration / 2;
          return { before, after: getComputedStyle(head).transform, count: animations.length };
        });
        expect(samples.count).toBeGreaterThan(0);
        // Idle spends time at rest; active poses must visibly move, not just carry a class.
        if (pose.activity !== "idle") expect(samples.after).not.toBe(samples.before);
        await pet.screenshot({
          path: testInfo.outputPath(
            `activity-${size}-${pose.activity}-${pose.voice?.phase ?? "chat"}.png`,
          ),
          omitBackground: true,
        });
        await pet.emulateMedia({ reducedMotion: "reduce" });
        expect(
          await art.evaluate((element) => element.getAnimations({ subtree: true }).length),
        ).toBe(0);
        await expect(art).toHaveAttribute("data-activity", pose.activity);
        await pet.emulateMedia({ reducedMotion: "no-preference" });
      }
    }

    await publish(completed);
    await expect(art).toHaveAttribute("data-activity", "happy");
    await pet.screenshot({
      path: testInfo.outputPath("activity-complete.png"),
      omitBackground: true,
    });
    await expect(art).toHaveAttribute("data-activity", "idle");
    // Opening another saved conversation cannot replay an old success.
    await publish({ ...completed, conversationId: "restored-conversation" });
    await expect(art).toHaveAttribute("data-activity", "idle");
    await publish(reply);
    await expect(art).toHaveAttribute("data-activity", "replying");
    await publish(completed);
    await expect(art).toHaveAttribute("data-activity", "happy");
    await publish({ ...completed, conversationId: "brief-visit" });
    await expect(art).toHaveAttribute("data-activity", "idle");
    await publish(completed);
    await expect(art).toHaveAttribute("data-activity", "idle");
    await publish(reply);
    await expect(art).toHaveAttribute("data-activity", "replying");
    await publish(completed);
    await expect(art).toHaveAttribute("data-activity", "happy");
    await publish(completed, { phase: "recording" });
    await expect(art).toHaveAttribute("data-activity", "listening");
    await publish(completed, { error: "cancelled" });
    await expect(art).toHaveAttribute("data-activity", "idle");
    await publish(reply);
    await expect(art).toHaveAttribute("data-activity", "replying");
    await publish({
      ...completed,
      messages: completed.messages.map((message) => ({ ...message, state: "stopped" })),
    });
    await expect(art).toHaveAttribute("data-activity", "idle");

    await publish(base, { phase: "recording" });
    await expect(art).toHaveAttribute("data-activity", "listening");
    await page.evaluate(() => window.computerCat.updatePreferences({ animation: false }));
    await expect(pet.locator(".pet-wrap")).not.toHaveClass(/animated/);
    expect(await art.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(
      0,
    );
    await expect(pet.locator(".cat-signal")).toHaveCount(4);
    await expect(pet.locator(".pet-bubble")).toHaveText("Listening");
    await page.evaluate(() => window.computerCat.updatePreferences({ animation: true }));
    await expect(pet.locator(".pet-wrap")).toHaveClass(/animated/);
    const button = await pet.locator(".pet-button").boundingBox();
    if (!button) throw new Error("Missing cat button");
    await pet.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await pet.mouse.down();
    await expect(pet.locator(".pet-wrap")).toHaveAttribute("data-motion-paused", "true");
    expect(
      await art.evaluate((element) =>
        element
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === "paused"),
      ),
    ).toBe(true);
    await pet.mouse.up();
    await expect(pet.locator(".pet-wrap")).toHaveAttribute("data-motion-paused", "false");
    // Playwright's own CDP session forces visibility, including for hidden Electron windows.
    // Exercise the Page Visibility boundary explicitly; native hide/show is checked separately.
    await pet.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(pet.locator(".pet-wrap")).toHaveAttribute("data-motion-paused", "true");
    await pet.evaluate(() => {
      Reflect.deleteProperty(document, "hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(pet.locator(".pet-wrap")).toHaveAttribute("data-motion-paused", "false");
    expect(errors).toEqual([]);
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("activity preview stays local and all poses support staged and reduced motion", async ({}, testInfo) => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    await page.getByRole("button", { name: "Options…", exact: true }).click();
    await page.getByRole("tab", { name: "Desktop cat", exact: true }).click();
    const preview = page.locator(".preview-surface .pet-art");
    for (const activity of Object.keys(PET_ACTIVITIES)) {
      await page.getByLabel("Preview activity", { exact: true }).selectOption(activity);
      await expect(preview).toHaveAttribute("data-activity", activity);
      await expect(pet.locator(".pet-art")).toHaveAttribute("data-activity", "idle");
      await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await preview.evaluate((element) => element.getAnimations({ subtree: true }).length),
      ).toBe(0);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      expect(
        await preview.evaluate((element) => element.getAnimations({ subtree: true }).length),
      ).toBeGreaterThan(0);
    }
    await page.getByLabel("Preview activity", { exact: true }).selectOption("transcribing");
    await page.getByRole("checkbox", { name: "Animate cat" }).uncheck();
    expect(
      await preview.evaluate((element) => element.getAnimations({ subtree: true }).length),
    ).toBe(0);
    await expect(pet.locator(".pet-wrap")).toHaveClass(/animated/);
    await page.screenshot({ path: testInfo.outputPath("activity-preview.png") });
    expect(
      await page.evaluate(async () => ({
        chat: await window.computerCat.snapshot(),
        voice: await window.computerCat.voiceSnapshot(),
      })),
    ).toMatchObject({ chat: { busy: false, messages: [] }, voice: { phase: "idle" } });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(pet.locator(".pet-wrap")).toHaveClass(/animated/);
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

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
    await showCatControls(pet);
    await expect(pet.getByRole("status")).toContainText(/Thinking|Replying/);
    await expect(page.getByRole("button", { name: "New conversation" })).toBeDisabled();
    await expect(page.locator(".message.assistant")).toContainText("local demo");
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("conversation.png") });
    await input.fill("First line");
    await input.press("Shift+Enter");
    await input.pressSequentially("Second line");
    await expect(input).toHaveValue("First line\nSecond line");
    await page.getByRole("button", { name: "Send message" }).click();
    await showCatControls(pet);
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
    await expect(page.getByRole("tab", { name: "Voice", exact: true })).toBeFocused();
    await expect(page.getByLabel("Enable voice input")).not.toBeChecked();
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
    await showCatControls(pet);
    await pet.getByRole("button", { name: "Chat", exact: true }).click();
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
      await showCatControls(pet);
      await pet.getByRole("button", { name: "Chat", exact: true }).click();
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
    for (const tab of ["Desktop cat", "Models", "Voice", "General"]) {
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
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.getByRole("tabpanel", { name: tab, exact: true }).evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      for (const name of ["OK", "Cancel", "Apply"]) {
        await expect(options.getByRole("button", { name, exact: true })).toBeInViewport();
      }
    }
    await page.screenshot({ path: testInfo.outputPath("options-small.png") });
    expect(rendererErrors).toEqual([]);
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

test("delayed send acknowledgements preserve edited drafts, including identical text", async () => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const electron = await launch(userData);
  try {
    const { page } = await windows(electron);
    // Hold the IPC response at the boundary; this test makes no model requests.
    await electron.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(
        channel,
        () =>
          new Promise((resolve) => {
            Reflect.set(globalThis, "releaseTestSend", resolve);
          }),
      );
    }, IPC.send);
    const input = page.getByRole("textbox", { name: "Message Computer Cat" });
    const send = page.getByRole("button", { name: "Send message" });
    const release = async (ok: boolean) => {
      await expect
        .poll(() => electron.evaluate(() => typeof Reflect.get(globalThis, "releaseTestSend")))
        .toBe("function");
      await electron.evaluate((_electron, accepted) => {
        Reflect.get(
          globalThis,
          "releaseTestSend",
        )(accepted ? { ok: true } : { ok: false, message: "Message was not accepted." });
        Reflect.deleteProperty(globalThis, "releaseTestSend");
      }, ok);
      await expect(page.locator(".statusbar").getByRole("status")).toHaveText("Ready");
    };
    await input.fill("Repeat this");
    await send.click();
    await expect(send).toBeDisabled();
    await input.fill("");
    await input.fill("Repeat this");
    await release(true);
    await expect(input).toHaveValue("Repeat this");
    await expect(send).toBeEnabled();

    // An untouched accepted draft is still cleared.
    await send.click();
    await release(true);
    await expect(input).toHaveValue("");

    await input.fill("Keep on failure");
    await send.click();
    await release(false);
    await expect(input).toHaveValue("Keep on failure");
    await expect(page.getByRole("alert")).toContainText("Message was not accepted.");
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

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("settings shortcuts preserve drafts and identify pending changes across tabs", async ({}, testInfo) => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  await writeFile(
    join(userData, "voice.json"),
    JSON.stringify({ ...DEFAULT_VOICE, inputDeviceId: "saved-microphone-fixture" }),
  );
  const electron = await launch(userData);
  try {
    const { page } = await windows(electron);
    const composer = page.getByRole("textbox", { name: "Message Computer Cat" });
    const options = page.getByRole("dialog", { name: "Options", exact: true });
    await composer.fill("Keep this draft while I set things up.");
    await page.getByRole("button", { name: "Set up voice…", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Voice", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tabpanel", { name: "Voice", exact: true })).toBeFocused();
    await expect(page.getByLabel("Acceleration")).toBeHidden();
    await page.getByLabel("Speech model", { exact: true }).selectOption("base.en");
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
    await expect(page.getByRole("button", { name: "Download model", exact: true })).toBeEnabled();
    await expect(page.locator(".settings-actions .save-status")).toContainText("Unsaved changes");
    await expect(page.getByRole("tab", { name: "Voice", exact: true })).toHaveAccessibleDescription(
      "Unsaved changes in this tab",
    );
    // Opening settings and changing the draft never starts capture or a download.
    expect(
      await page.evaluate(async () => {
        const voice = await window.computerCat.voiceSnapshot();
        return { phase: voice.phase, download: voice.download, model: voice.settings?.modelId };
      }),
    ).toEqual({ phase: "idle", download: undefined, model: "large-v3-turbo" });
    await page.screenshot({ path: testInfo.outputPath("settings-voice-setup.png") });
    await page.getByText("Microphone & performance", { exact: true }).click();
    await expect(page.getByLabel("Acceleration")).toBeVisible();
    await expect(page.getByLabel("Microphone", { exact: true })).toHaveValue(
      "saved-microphone-fixture",
    );
    await expect(
      page.getByLabel("Microphone", { exact: true }).locator("option:checked"),
    ).toHaveText("Saved microphone");
    await page.getByRole("tab", { name: "Desktop cat", exact: true }).click();
    const preview = page.locator(".preview-surface .pet-art");
    const mediumHeight = await preview.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await page.getByRole("radio", { name: "Small", exact: true }).check();
    expect(
      await preview.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThan(mediumHeight);
    await expect(page.locator(".tab-dirty")).toHaveCount(2);
    await options.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue("Keep this draft while I set things up.");
    await page.getByRole("button", { name: "Models & sign-in…", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Models", exact: true })).toBeFocused();
    await expect(options.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    await expect(page.locator(".tab-dirty")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("settings-models.png") });
    await page.keyboard.press("Escape");
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue("Keep this draft while I set things up.");
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

test("a partial settings save identifies the failed tab and retries its remaining draft", async () => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-smoke-"));
  const obstruction = join(userData, "voice.json.tmp");
  await mkdir(obstruction);
  const electron = await launch(userData);
  try {
    const { page } = await windows(electron);
    const options = page.getByRole("dialog", { name: "Options", exact: true });
    await page.getByRole("button", { name: "Set up voice…", exact: true }).click();
    await page.getByLabel("Speech model", { exact: true }).selectOption("base.en");
    await page.getByRole("tab", { name: "Desktop cat", exact: true }).click();
    await page.getByRole("radio", { name: "Small", exact: true }).check();
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await options.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(options.getByRole("alert")).toContainText("Saved: Desktop cat.");
    await expect(page.getByRole("tab", { name: "Voice", exact: true })).toBeFocused();
    await expect(page.getByLabel("Speech model", { exact: true })).toHaveValue("base.en");
    await expect(page.locator(".tab-dirty")).toHaveCount(1);
    expect(
      await page.evaluate(async () => (await window.computerCat.info()).preferences.size),
    ).toBe("small");
    expect(
      await page.evaluate(async () => (await window.computerCat.voiceSnapshot()).settings?.modelId),
    ).toBe("large-v3-turbo");
    await rmdir(obstruction);
    await options.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator(".settings-actions .save-status")).toHaveText("Changes saved.");
    await expect(options.getByRole("alert")).toBeHidden();
    await expect(page.locator(".tab-dirty")).toHaveCount(0);
    expect(
      await page.evaluate(async () => (await window.computerCat.voiceSnapshot()).settings?.modelId),
    ).toBe("base.en");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Message Computer Cat" })).toBeFocused();
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
    // Apply is disabled and the old error is cleared while the save is still in flight.
    await expect
      .poll(() => page.evaluate(async () => (await window.computerCat.info()).preferences.size))
      .toBe("large");
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
    const toggle = pet.getByRole("button", { name: "Show cat controls" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(pet.getByRole("button", { name: "Chat", exact: true })).toBeHidden();
    await expect(pet.locator(".pet-handle")).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(pet.locator(".pet-wrap")).toHaveClass(/selected/);
    await pet.screenshot({ path: testInfo.outputPath("cat-controls.png"), omitBackground: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.focus();
    await pet.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await pet.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await pet.emulateMedia({ reducedMotion: "no-preference" });
    expect(
      await pet.locator(".cat-head").evaluate((element) => getComputedStyle(element).animationName),
    ).toMatch(/^cat-(look|hello)$/);
    expect(
      await pet
        .locator(".cat-eye-left")
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("cat-blink");
    await pet.screenshot({ path: testInfo.outputPath("cat-idle.png"), omitBackground: true });
    await pet.locator(".cat-eye-left").evaluate((element) => {
      const animation = element.getAnimations()[0];
      if (animation) {
        animation.pause();
        animation.currentTime = 2992;
      }
    });
    await pet.screenshot({ path: testInfo.outputPath("cat-blink.png"), omitBackground: true });
    await pet.locator(".cat-eye-left").evaluate((element) => element.getAnimations()[0]?.play());

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
    await showCatControls(pet);
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
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
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
    await showCatControls(pet);
    await pet.getByRole("button", { name: "Chat", exact: true }).click();
    await expect.poll(async () => (await petState()).chatVisible).toBe(true);

    for (const size of ["Small", "Medium", "Large"]) {
      await showCatControls(pet);
      await pet.getByRole("button", { name: "Cat options" }).click();
      await page.getByRole("radio", { name: size, exact: true }).check();
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await composeMessage(page, "Hello");
      await page.getByRole("button", { name: "Send message" }).click();
      await showCatControls(pet);
      await expect(pet.getByRole("button", { name: "Stop reply" })).toBeVisible();
      expect(
        await pet
          .locator(".cat-head")
          .evaluate((element) => getComputedStyle(element).animationName),
      ).toMatch(/^cat-(think|talk)$/);
      expect(
        await pet
          .locator(".pet-dock")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await pet.screenshot({
        path: testInfo.outputPath(`cat-thinking-${size.toLowerCase()}.png`),
        omitBackground: true,
      });
      await showCatControls(pet);
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
