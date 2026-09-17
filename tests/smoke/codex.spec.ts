import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect, test } from "@playwright/test";
import { sendAndWaitForReply } from "./chat";

async function launch(userData: string) {
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
      COMPUTERCAT_PROVIDER: "offline-provider",
      COMPUTERCAT_MODEL: "offline-model",
      COMPUTERCAT_API_KEY: "test-only",
      COMPUTERCAT_SMOKE_TEST: "1",
      COMPUTERCAT_TEST_USER_DATA: userData,
    },
  });
  await expect.poll(() => electron.windows().length).toBe(2);
  const page = electron.windows().find((window) => window.url().includes("view=chat"));
  const pet = electron.windows().find((window) => window.url().includes("view=pet"));
  if (!page || !pet) throw new Error("Missing application windows");
  await expect(page.getByRole("button", { name: "Options…" })).toBeEnabled();
  return { electron, page, pet };
}

async function interceptCodex(electron: ElectronApplication) {
  await electron.evaluate(({ shell, utilityProcess }, fixture) => {
    const state = { allowLogin: false, refreshes: 0, requests: [] as unknown[] };
    Reflect.set(globalThis, "offlineCodex", state);
    shell.openExternal = async () => {};
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode")
        return Response.json({
          device_auth_id: "offline-device",
          user_code: "TEST-CODE",
          interval: "1",
        });
      if (url === "https://auth.openai.com/api/accounts/deviceauth/token")
        return state.allowLogin
          ? Response.json({ authorization_code: "offline-code", code_verifier: "offline-verifier" })
          : new Response("pending", { status: 403 });
      if (url === "https://auth.openai.com/oauth/token") {
        const refresh =
          new URLSearchParams(String(init?.body)).get("grant_type") === "refresh_token";
        if (refresh) state.refreshes++;
        const payload = Buffer.from(
          JSON.stringify({
            "https://api.openai.com/auth": { chatgpt_account_id: "offline-account" },
            refreshed: refresh,
          }),
        ).toString("base64");
        return Response.json({
          access_token: `header.${payload}.signature`,
          refresh_token: "offline-refresh-secret",
          expires_in: refresh ? 3600 : 1,
        });
      }
      throw new Error("Unexpected offline authentication endpoint");
    };
    const nativeFork = utilityProcess.fork.bind(utilityProcess);
    utilityProcess.fork = (entry, _args, options) => {
      const child = nativeFork(fixture, [entry], options);
      child.on("message", (event) => {
        if (event?.type === "test-provider-request") state.requests.push(event);
      });
      return child;
    };
  }, resolve("tests/fixtures/codex-worker.mjs"));
}

async function cleanup(userData: string) {
  if (!userData.startsWith(join(tmpdir(), "computercat-codex-")))
    throw new Error("Unexpected test directory");
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("Codex sign-in, model defaults, refresh, real worker streaming, and restart stay isolated", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-codex-"));
  let app = await launch(userData);
  try {
    await interceptCodex(app.electron);
    let { page, pet } = app;
    expect(
      await pet.evaluate(() =>
        window.computerCat.codexLogin({ method: "device_code" }).then(
          () => "allowed",
          () => "denied",
        ),
      ),
    ).toBe("denied");
    expect(
      await page.evaluate(() => window.computerCat.codexLogin({ method: "shell" } as never)),
    ).toMatchObject({ ok: false });
    expect(
      await page.evaluate(() =>
        window.computerCat.updateModels({
          source: "codex",
          codexModel: "gpt-5.6-sol",
          reasoning: "medium",
          apiKey: "injection",
        } as never),
      ),
    ).toMatchObject({ ok: false });
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByRole("button", { name: "Sign in with ChatGPT" }).click();
    await expect(page.getByText("Browser didn't return to Computer Cat?")).toBeVisible();
    await page.getByText("Browser didn't return to Computer Cat?").click();
    await page
      .getByRole("textbox", { name: "Callback URL" })
      .fill("http://localhost:1455/auth/callback?code=old&state=stale");
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("complete localhost callback URL");
    await page.keyboard.press("Escape");
    expect((await page.evaluate(() => window.computerCat.info())).models.codex.login).toBeNull();
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByRole("button", { name: "Use a device code" }).click();
    await expect(page.getByRole("textbox", { name: "Sign-in code" })).toHaveValue("TEST-CODE");
    await page.screenshot({ path: testInfo.outputPath("device-sign-in.png") });
    await app.electron.evaluate(() => {
      Reflect.get(globalThis, "offlineCodex").allowLogin = true;
    });
    await expect(page.getByText("Connected to ChatGPT", { exact: true })).toBeVisible();
    await page.getByLabel("Connection:", { exact: true }).selectOption("codex");
    await page.getByLabel("Model:", { exact: true }).selectOption("gpt-5.6-terra");
    await page.getByLabel("Reasoning:", { exact: true }).selectOption("high");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await expect(page.getByLabel("Connection:", { exact: true })).toHaveValue("demo");
    await expect(page.getByText("Connected to ChatGPT", { exact: true })).toBeVisible();
    await page.getByLabel("Connection:", { exact: true }).selectOption("codex");
    await page.getByLabel("Model:", { exact: true }).selectOption("gpt-5.6-terra");
    await page.getByLabel("Reasoning:", { exact: true }).selectOption("high");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("connected-models.png") });
    await app.electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("view=chat"))
        ?.setSize(500, 420),
    );
    await expect(page.getByLabel("Reasoning:", { exact: true })).toBeInViewport();
    const panel = page.getByRole("tabpanel", { name: "Models", exact: true });
    expect(await panel.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("connected-models-small.png") });
    await page.getByRole("button", { name: "OK", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Message Computer Cat" });
    const fixtureFile = join(userData, "desktop-fixture.txt");
    await writeFile(fixtureFile, "fixture-file-content");
    await input.fill(`first-context-canary\nread-fixture:${JSON.stringify(fixtureFile)}`);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".message.assistant").last()).not.toHaveAttribute(
      "data-state",
      "streaming",
      { timeout: 45_000 },
    );
    await expect(page.locator(".message.assistant").last()).toHaveText(/Offline Codex reply\./, {
      timeout: 45_000,
    });
    await expect(page.getByRole("button", { name: "Stop reply" })).toBeHidden();
    expect(
      await app.electron.evaluate(() => Reflect.get(globalThis, "offlineCodex").refreshes),
    ).toBe(1);
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByLabel("Model:", { exact: true }).selectOption("gpt-5.6-sol");
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(page.locator(".statusbar")).toContainText("gpt-5.6-terra");
    await expect(await sendAndWaitForReply(page, "follow-up")).toContainText(
      "Offline Codex reply.",
    );
    const requests = await app.electron.evaluate(
      () => Reflect.get(globalThis, "offlineCodex").requests,
    );
    expect(requests).toHaveLength(3);
    await expect(page.getByRole("list", { name: "Tool activity" }).first()).toContainText(
      "read · complete",
    );
    expect(requests[0]).toMatchObject({
      model: "gpt-5.6-terra",
      reasoning: "high",
      authenticated: true,
    });
    expect(requests[0].tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      "bash",
      "edit",
      "find",
      "grep",
      "ls",
      "powershell",
      "read",
      "write",
    ]);
    expect(requests[2].model).toBe("gpt-5.6-terra");
    expect(JSON.stringify(requests[2].input)).toContain("first-context-canary");
    await page.getByLabel("Chat model", { exact: true }).selectOption("codex:gpt-5.6-sol");
    await page.getByLabel("Chat reasoning", { exact: true }).selectOption("medium");
    await expect(page.getByLabel("Chat model", { exact: true })).toHaveValue("codex:gpt-5.6-sol");
    await expect(page.getByLabel("Chat reasoning", { exact: true })).toHaveValue("medium");
    await expect(page.getByLabel("Chat reasoning", { exact: true })).toBeEnabled();
    await sendAndWaitForReply(page, "Continue after changing models");
    const switched = await app.electron.evaluate(() =>
      Reflect.get(globalThis, "offlineCodex").requests.at(-1),
    );
    expect(switched.model).toBe("gpt-5.6-sol");
    expect(switched.reasoning).toBe("medium");
    expect(JSON.stringify(switched.input)).toContain("fixture-file-content");
    await app.pet.getByRole("button", { name: "Choose model" }).click();
    const picker = page.getByRole("dialog", { name: "Choose model" });
    await picker.getByLabel("Chat model", { exact: true }).selectOption("codex:gpt-5.6-terra");
    await picker.getByRole("button", { name: "Done", exact: true }).click();
    await expect(app.pet.getByRole("button", { name: "Choose model" })).toContainText(
      "gpt-5.6-terra",
    );
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page.locator(".statusbar")).toContainText("gpt-5.6-sol");
    await input.fill("trigger-provider-error");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".message.assistant").last()).toContainText("Codex couldn't finish", {
      timeout: 45_000,
    });
    await expect(page.locator(".message.assistant").last()).not.toContainText(
      "private provider details",
    );
    expect(
      (await readFile(join(userData, "codex-credentials.enc"))).includes(
        Buffer.from("offline-refresh-secret"),
      ),
    ).toBe(false);
    await app.electron.close();
    app = await launch(userData);
    page = app.page;
    await expect(page.locator(".message")).toHaveCount(2);
    const restored = await page.evaluate(() => window.computerCat.info());
    expect(restored.models.codex.connected).toBe(true);
    expect(restored.models.defaults).toEqual({
      source: "codex",
      codexModel: "gpt-5.6-sol",
      reasoning: "high",
    });
    expect(restored.model).toBe("gpt-5.6-sol");
    expect(JSON.stringify(restored)).not.toContain("offline-refresh");
    await interceptCodex(app.electron);
    await page.getByRole("button", { name: "History…" }).click();
    await page.getByRole("button", { name: /first-context-canary/ }).click();
    await page.getByRole("button", { name: "Open conversation", exact: true }).click();
    await sendAndWaitForReply(page, "Continue the restored chat");
    const resumed = await app.electron.evaluate(() =>
      Reflect.get(globalThis, "offlineCodex").requests.at(-1),
    );
    expect(JSON.stringify(resumed.input)).toContain("fixture-file-content");
    expect(JSON.stringify(resumed.input)).not.toContain("trigger-provider-error");
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
    await expect(readFile(join(userData, "codex-credentials.enc"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await page.getByLabel("Connection:", { exact: true }).selectOption("demo");
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByLabel("Chat model", { exact: true }).selectOption("demo");
    await expect(page.locator(".statusbar")).toContainText("Demo — no API calls");
  } finally {
    await app.electron.close();
    await cleanup(userData);
  }
});

test("a failed model save preserves the draft and current connection until retry", async () => {
  const userData = await mkdtemp(join(tmpdir(), "computercat-codex-"));
  await mkdir(join(userData, "models.json.tmp"));
  const { electron, page } = await launch(userData);
  try {
    await page.getByRole("button", { name: "Options…" }).click();
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page.getByLabel("Connection:", { exact: true }).selectOption("environment");
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn't save your default model");
    expect((await page.evaluate(() => window.computerCat.info())).mode).toBe("demo");
    await expect(page.getByLabel("Connection:", { exact: true })).toHaveValue("environment");
    await rmdir(join(userData, "models.json.tmp"));
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect((await page.evaluate(() => window.computerCat.info())).models.defaults.source).toBe(
      "environment",
    );
  } finally {
    await electron.close();
    await cleanup(userData);
  }
});
