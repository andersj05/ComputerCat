import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect, test } from "@playwright/test";
import { IPC } from "../../src/shared/contracts";
import { showCatControls } from "./chat";

async function launch(userData: string) {
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
      COMPUTERCAT_RUNTIME: "demo",
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
  await expect(page.getByRole("button", { name: "Share screen…" })).toBeEnabled();
  // Consent and status checks must never enumerate or capture the user's real desktop.
  await electron.evaluate(({ desktopCapturer }) => {
    Reflect.set(globalThis, "desktopCaptureCalls", 0);
    desktopCapturer.getSources = async () => {
      Reflect.set(
        globalThis,
        "desktopCaptureCalls",
        Reflect.get(globalThis, "desktopCaptureCalls") + 1,
      );
      throw new Error("Real desktop capture is forbidden in smoke tests");
    };
  });
  return { page, pet };
}

async function removeTestData(userData: string) {
  if (!userData.startsWith(join(tmpdir(), "computercat-desktop-smoke-")))
    throw new Error("Unexpected test directory");
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("screen sharing needs consent, stays visible on the cat, and resets after restart", async ({}, testInfo) => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-desktop-smoke-"));
  let electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    pet.on("pageerror", (error) => errors.push(error.message));
    expect(await page.evaluate(() => window.computerCat.desktopSnapshot())).toMatchObject({
      enabled: false,
      busy: false,
    });
    await page.getByRole("button", { name: "Share screen…" }).click();
    const dialog = page.getByRole("dialog", { name: "Share your screen" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expect(dialog).toContainText("selected model");
    await expect(dialog).toContainText("local model context");
    await expect(dialog).toContainText("browser tabs");
    expect((await page.evaluate(() => window.computerCat.desktopSnapshot())).enabled).toBe(false);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message Computer Cat" })).toBeFocused();
    await page.getByRole("button", { name: "Share screen…" }).click();
    await dialog.getByRole("button", { name: "Start sharing", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
    await expect(pet.getByRole("button", { name: "Show cat controls" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(pet.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
    await expect(page.getByText("Screen sharing on", { exact: true })).toBeVisible();

    await electron.evaluate(({ BrowserWindow }, channel) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(channel, {
          enabled: true,
          busy: true,
          lastAction: "Reading an app",
        });
      }
    }, IPC.desktopChanged);
    await expect(page.getByText("Reading screen…", { exact: true })).toBeVisible();
    await expect(pet.getByText("Reading screen…", { exact: true })).toBeVisible();
    await expect(pet.getByRole("button", { name: "Stop sharing", exact: true })).toBeEnabled();
    await pet.getByRole("button", { name: "Stop sharing", exact: true }).click();
    await expect(page.getByRole("button", { name: "Share screen…" })).toBeVisible();
    expect((await pet.evaluate(() => window.computerCat.desktopSnapshot())).enabled).toBe(false);

    await page.getByRole("button", { name: "Desktop", exact: true }).click();
    await showCatControls(pet);
    await pet.getByRole("button", { name: "Share screen…" }).click();
    await expect(dialog).toBeVisible();
    await electron.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("view=chat"))
        ?.setSize(500, 420);
    });
    await page.screenshot({ path: testInfo.outputPath("screen-sharing-consent-narrow.png") });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await dialog.getByRole("button", { name: "Start sharing", exact: true }).click();
    for (const size of ["small", "medium", "large"] as const) {
      await page.evaluate((size) => window.computerCat.updatePreferences({ size }), size);
      await showCatControls(pet);
      await expect(pet.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
      expect(
        await pet
          .locator(".pet-footer")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await pet.screenshot({
        path: testInfo.outputPath(`screen-sharing-cat-${size}.png`),
        omitBackground: true,
      });
      await pet.keyboard.press("Escape");
      await expect(pet.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
    }
    expect(await electron.evaluate(() => Reflect.get(globalThis, "desktopCaptureCalls"))).toBe(0);
    expect(errors).toEqual([]);
    await electron.close();
    electron = await launch(userData);
    const restored = await windows(electron);
    expect((await restored.page.evaluate(() => window.computerCat.desktopSnapshot())).enabled).toBe(
      false,
    );
    await expect(
      restored.pet.getByRole("button", { name: "Stop sharing", exact: true }),
    ).toBeHidden();
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

test("desktop sharing validates requests and never exposes capture or arbitrary IPC to renderers", async () => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-desktop-smoke-"));
  const electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    for (const renderer of [page, pet]) {
      expect(
        await renderer.evaluate(() => ({
          require: typeof Reflect.get(window, "require"),
          process: typeof Reflect.get(window, "process"),
          desktopKeys: Object.keys(window.computerCat)
            .filter((key) => key.startsWith("desktop"))
            .sort(),
          ipc: typeof Reflect.get(window.computerCat, "invoke"),
        })),
      ).toEqual({
        require: "undefined",
        process: "undefined",
        desktopKeys: ["desktopOpenSharing", "desktopSetEnabled", "desktopSnapshot"],
        ipc: "undefined",
      });
      for (const invalid of [{ enabled: "true" }, { enabled: true, sourceId: "display" }, null]) {
        const result = await renderer.evaluate(
          (request) => window.computerCat.desktopSetEnabled(request),
          invalid,
        );
        expect(result.enabled).toBe(false);
        expect(result.error).toBeTruthy();
      }
    }
    expect(
      await electron.evaluate(
        async ({ BrowserWindow, app }, channels) => {
          const preload = `${app.getAppPath()}/out/preload/index.cjs`;
          const stranger = new BrowserWindow({
            show: false,
            webPreferences: {
              ...(preload ? { preload } : {}),
              contextIsolation: true,
              sandbox: true,
              nodeIntegration: false,
            },
          });
          try {
            await stranger.loadURL("about:blank");
            return await stranger.webContents.executeJavaScript(
              `Promise.all(${JSON.stringify(channels)}.map(name => window.computerCat[name]({ enabled: true }).then(() => "allowed", () => "denied")))`,
            );
          } finally {
            stranger.destroy();
          }
        },
        ["desktopSnapshot", "desktopSetEnabled", "desktopOpenSharing"],
      ),
    ).toEqual(["denied", "denied", "denied"]);
    expect((await page.evaluate(() => window.computerCat.desktopSnapshot())).enabled).toBe(false);
    expect(await electron.evaluate(() => Reflect.get(globalThis, "desktopCaptureCalls"))).toBe(0);
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});

test("failed sharing changes stay visible and do not imply access was granted or revoked", async () => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-desktop-smoke-"));
  const electron = await launch(userData);
  try {
    const { page, pet } = await windows(electron);
    await electron.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({
        enabled: false,
        busy: false,
        error: "Screen access is unavailable.",
      }));
    }, IPC.desktopSetEnabled);
    await page.getByRole("button", { name: "Share screen…" }).click();
    const dialog = page.getByRole("dialog", { name: "Share your screen" });
    await dialog.getByRole("button", { name: "Start sharing", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Screen access is unavailable.");
    await expect(dialog).toBeVisible();
    await expect(pet.getByRole("button", { name: "Stop sharing", exact: true })).toBeHidden();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await electron.evaluate(({ ipcMain, BrowserWindow }, channels) => {
      ipcMain.removeHandler(channels.desktopSetEnabled);
      ipcMain.handle(channels.desktopSetEnabled, () => ({
        enabled: true,
        busy: false,
        error: "Couldn't stop sharing. Try again.",
      }));
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send(channels.desktopChanged, { enabled: true, busy: false });
    }, IPC);
    await pet.getByRole("button", { name: "Stop sharing", exact: true }).click();
    await expect(pet.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
    await expect(pet.getByRole("status")).toContainText("Couldn't stop sharing. Try again.");
    expect(await electron.evaluate(() => Reflect.get(globalThis, "desktopCaptureCalls"))).toBe(0);
  } finally {
    await electron.close();
    await removeTestData(userData);
  }
});
