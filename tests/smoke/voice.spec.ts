import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { IPC } from "../../src/shared/contracts";
import { DEFAULT_VOICE } from "../../src/shared/voice";
import { showCatControls } from "./chat";

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("local voice records synthetic audio, reviews text, and cancels without sending", async ({}, testInfo) => {
  const dir = await mkdtemp(join(tmpdir(), "computercat-voice-smoke-"));
  await writeFile(
    join(dir, "voice.json"),
    JSON.stringify({ ...DEFAULT_VOICE, enabled: true, keepReady: true, modelId: "base.en" }),
  );
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    COMPUTERCAT_RUNTIME: "demo",
    COMPUTERCAT_SMOKE_TEST: "1",
    COMPUTERCAT_TEST_USER_DATA: dir,
    COMPUTERCAT_VOICE_FIXTURE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.COMPUTERCAT_PACKAGED_EXECUTABLE;
  const app = await _electron.launch({
    ...(executable ? { executablePath: executable, args: [] } : { args: [resolve(".")] }),
    env,
  });
  try {
    let page = await app.firstWindow();
    for (let i = 0; i < 30; i++) {
      const p = app.windows().find((p) => p.url().includes("view=chat"));
      if (p) {
        page = p;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.getByRole("button", { name: "Talk", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Talk", exact: true }).click();
    await expect(page.locator(".voice-controls")).toContainText("Listening", { timeout: 15000 });
    const pet = app.windows().find((window) => window.url().includes("view=pet"));
    if (!pet) throw new Error("Missing desktop cat");
    await expect(pet.locator(".pet-art")).toHaveAttribute("data-activity", "listening");
    await expect(pet.locator(".pet-bubble")).toHaveText("Listening");
    await expect(page.getByRole("button", { name: "Finish recording" })).toBeEnabled();
    await expect
      .poll(() => page.evaluate(async () => (await window.computerCat.voiceSnapshot()).elapsedMs))
      .toBeGreaterThan(700);
    await page.getByRole("button", { name: "Finish recording" }).click();
    await expect(page.locator("#message-input")).toHaveValue("Do not delete the folder.");
    await expect(page.locator(".message.user")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("voice-draft.png") });
    await page.getByRole("button", { name: "Talk", exact: true }).click();
    await expect(page.locator(".voice-controls")).toContainText("Listening");
    await page.locator("#message-input").fill("Typed while listening.");
    await expect
      .poll(() => page.evaluate(async () => (await window.computerCat.voiceSnapshot()).elapsedMs))
      .toBeGreaterThan(700);
    await page.getByRole("button", { name: "Finish recording" }).click();
    await expect(page.locator("#voice-review-text")).toHaveValue("Do not delete the folder.");
    await expect(page.locator("#message-input")).toHaveValue("Typed while listening.");
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(page.locator("#message-input")).toHaveValue(
      "Typed while listening. Do not delete the folder.",
    );
    await page.getByRole("button", { name: "Talk", exact: true }).click();
    await expect(page.locator(".voice-controls")).toContainText("Listening");
    await page.getByRole("button", { name: "Cancel recording" }).click();
    await expect(page.getByRole("button", { name: "Talk", exact: true })).toBeVisible();
    await expect(page.locator("#message-input")).toHaveValue(
      "Typed while listening. Do not delete the folder.",
    );
    await page.getByRole("button", { name: "Options…", exact: true }).click();
    await page.getByRole("tab", { name: "Voice", exact: true }).click();
    await expect(page.getByLabel("Enable voice input")).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath("voice-options.png") });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const beforeSend = await readdir(join(dir, "conversations")).catch(() => []);
    expect(beforeSend.filter((name) => name.endsWith(".json"))).toEqual([]);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".message.user")).toContainText(
      "Typed while listening. Do not delete the folder.",
    );
    await expect(page.locator('.message.assistant[data-state="complete"]')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await checkCleanup(dir);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

async function checkCleanup(dir: string): Promise<void> {
  if (!dir.startsWith(join(tmpdir(), "computercat-voice-smoke-"))) throw Error("Unsafe cleanup");
}

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("desktop voice stays beside the cat with preview, review, reply and scoped permissions", async ({}, testInfo) => {
  test.setTimeout(60000);
  const dir = await mkdtemp(join(tmpdir(), "computercat-voice-smoke-"));
  await writeFile(
    join(dir, "voice.json"),
    JSON.stringify({ ...DEFAULT_VOICE, enabled: true, keepReady: true, modelId: "base.en" }),
  );
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    COMPUTERCAT_RUNTIME: "demo",
    COMPUTERCAT_SMOKE_TEST: "1",
    COMPUTERCAT_TEST_USER_DATA: dir,
    COMPUTERCAT_VOICE_FIXTURE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.COMPUTERCAT_PACKAGED_EXECUTABLE;
  const app = await _electron.launch({
    ...(executable ? { executablePath: executable, args: [] } : { args: [resolve(".")] }),
    env,
  });
  try {
    await expect.poll(() => app.windows().length).toBe(2);
    const page = app.windows().find((p) => p.url().includes("view=chat"));
    const pet = app.windows().find((p) => p.url().includes("view=pet"));
    if (!page || !pet) throw Error("Missing windows");
    await pet.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const tracks: MediaStreamTrack[] = [];
      Reflect.set(window, "testVoiceTracks", tracks);
      navigator.mediaDevices.getUserMedia = async (options) => {
        const stream = await original(options);
        tracks.push(...stream.getTracks());
        return stream;
      };
    });
    expect(
      await page.evaluate(() =>
        navigator.mediaDevices.getUserMedia({ audio: true }).then(
          (s) => {
            s.getTracks().forEach((t) => {
              t.stop();
            });
            return "allowed";
          },
          () => "denied",
        ),
      ),
    ).toBe("denied");
    expect(
      await pet.evaluate(() =>
        window.computerCat
          .voiceUpdateSettings({
            version: 1,
            enabled: true,
            keepReady: true,
            modelId: "base.en",
            language: "en",
            backend: "cpu",
          })
          .then(
            () => "allowed",
            () => "denied",
          ),
      ),
    ).toBe("denied");
    expect(
      await pet.evaluate(async () => (await window.computerCat.voiceSnapshot()).settings),
    ).toBeUndefined();
    await page.getByRole("button", { name: "Desktop", exact: true }).click();
    const chatVisible = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("view=chat"))
          ?.isVisible(),
      );
    expect(await chatVisible()).toBe(false);
    const catBounds = await pet.locator(".pet-button").boundingBox();
    await expect
      .poll(() => pet.evaluate(async () => (await window.computerCat.voiceSnapshot()).availability))
      .toBe("ready");
    await app.evaluate(({ BrowserWindow }, channel) => {
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes("view=pet"))
        ?.webContents.send(channel);
    }, IPC.petTalkRequested);
    await expect(pet.locator(".pet-voice")).toContainText("Listening");
    await expect(pet.locator(".pet-art")).toHaveAttribute("data-activity", "listening");
    await expect(page.getByRole("button", { name: "Finish recording" })).toBeDisabled();
    expect(await chatVisible()).toBe(false);
    const expandedCat = await pet.locator(".pet-button").boundingBox();
    expect(expandedCat?.width).toBeCloseTo(catBounds?.width ?? 0, 0);
    expect(expandedCat?.height).toBeCloseTo(catBounds?.height ?? 0, 0);
    await expect(pet.locator(".pet-voice-transcript")).toContainText("Do not delete the folder.", {
      timeout: 15000,
    });
    await pet.screenshot({ path: testInfo.outputPath("pet-listening.png") });
    expect(
      await page.evaluate(() =>
        window.computerCat.voiceRequestFinish({ sessionId: crypto.randomUUID() }).then(
          () => "allowed",
          () => "denied",
        ),
      ),
    ).toBe("denied");
    expect(
      await page.evaluate(() =>
        navigator.mediaDevices.getUserMedia({ audio: true }).then(
          (s) => {
            s.getTracks().forEach((t) => {
              t.stop();
            });
            return "allowed";
          },
          () => "denied",
        ),
      ),
    ).toBe("denied");
    expect(
      await page.evaluate(() =>
        navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(
          (s) => {
            s.getTracks().forEach((t) => {
              t.stop();
            });
            return "allowed";
          },
          () => "denied",
        ),
      ),
    ).toBe("denied");
    const send = await page.evaluate(() =>
      window.computerCat.send({ id: crypto.randomUUID(), text: "must not send" }),
    );
    expect(send.ok).toBe(false);
    await pet.getByRole("button", { name: "Finish recording" }).click();
    await expect(pet.locator("#pet-voice-draft")).toHaveValue("Do not delete the folder.");
    await expect(pet.locator(".pet-art")).toHaveAttribute("data-activity", "review");
    await expect(page.locator("#message-input")).toHaveValue("");
    await pet.locator("#pet-voice-draft").fill("Keep the folder, please.");
    await pet.getByRole("button", { name: "Close voice bubble" }).click();
    await showCatControls(pet);
    await pet.getByRole("button", { name: "Talk", exact: true }).click();
    await expect(pet.locator("#pet-voice-draft")).toHaveValue("Keep the folder, please.");
    expect(await pet.evaluate(async () => (await window.computerCat.voiceSnapshot()).phase)).toBe(
      "idle",
    );
    await pet.screenshot({ path: testInfo.outputPath("pet-review.png") });
    await pet.locator("#pet-voice-draft").press("Enter");
    await expect(page.locator(".message.user")).toContainText("Keep the folder, please.");
    await expect(pet.locator(".pet-voice-reply")).not.toBeEmpty();
    await expect(pet.getByRole("button", { name: "Talk", exact: true })).toBeVisible();
    expect(await chatVisible()).toBe(false);
    await pet.screenshot({ path: testInfo.outputPath("pet-reply.png") });
    await pet.getByRole("button", { name: "Talk", exact: true }).click();
    await expect(pet.locator(".pet-voice")).toContainText("Listening");
    await pet.getByRole("button", { name: "Close voice bubble" }).click();
    await expect(pet.locator(".pet-voice")).toHaveCount(0);
    await expect(pet.locator(".pet-art")).toHaveAttribute("data-activity", "idle");
    await expect
      .poll(() => pet.evaluate(async () => (await window.computerCat.voiceSnapshot()).phase))
      .toBe("idle");
    expect(
      await pet.evaluate(() =>
        (Reflect.get(window, "testVoiceTracks") as MediaStreamTrack[]).every(
          (t) => t.readyState === "ended",
        ),
      ),
    ).toBe(true);
    await page.evaluate(() => window.computerCat.openChat());
    await page.getByRole("button", { name: "Talk", exact: true }).click();
    await expect(page.locator(".voice-controls")).toContainText("Listening");
    await page.getByRole("button", { name: "Minimize window" }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.computerCat.voiceSnapshot()).phase))
      .toBe("idle");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("view=chat"),
      );
      win?.restore();
      win?.setSize(500, 420);
    });
    await page.getByRole("button", { name: "Options…", exact: true }).click();
    await page.getByRole("tab", { name: "Voice", exact: true }).click();
    await expect(page.getByRole("button", { name: "OK", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("voice-options-small.png") });
    await page.getByLabel("Enable voice input").uncheck();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      await page.evaluate(async () => (await window.computerCat.voiceSnapshot()).settings?.enabled),
    ).toBe(true);
    await page.evaluate(async () => {
      const settings = (await window.computerCat.voiceSnapshot()).settings;
      if (settings) await window.computerCat.voiceUpdateSettings({ ...settings, enabled: false });
    });
    await page.getByRole("button", { name: "Desktop", exact: true }).click();
    await showCatControls(pet);
    await pet.getByRole("button", { name: "Talk", exact: true }).click();
    await expect(pet.getByRole("button", { name: "Set up voice…" })).toBeVisible();
    expect(await chatVisible()).toBe(false);
    await pet.getByRole("button", { name: "Set up voice…" }).click();
    await expect(page.getByRole("tab", { name: "Voice", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  } finally {
    await app.close();
    await checkCleanup(dir);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
