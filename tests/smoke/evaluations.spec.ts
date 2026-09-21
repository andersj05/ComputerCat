import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron, expect, test } from "@playwright/test";
import electronPath from "electron";

const execute = promisify(execFile);

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("evaluation CLI reuses the running app connection even when its saved vault cannot be read", async ({}) => {
  test.setTimeout(90_000);
  test.skip(
    Boolean(process.env.COMPUTERCAT_PACKAGED_EXECUTABLE),
    "Development-only evaluations are disabled in packaged apps.",
  );
  const directory = await mkdtemp(join(tmpdir(), "computercat-eval-auth-"));
  let host: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  try {
    await execute(
      electronPath as unknown as string,
      [resolve("tests/fixtures/evaluation-vault.cjs"), directory],
      { windowsHide: true, timeout: 20000 },
    );
    host = await _electron.launch({
      args: [resolve(".")],
      env: {
        ...process.env,
        COMPUTERCAT_SMOKE_TEST: "1",
        COMPUTERCAT_TEST_USER_DATA: directory,
        COMPUTERCAT_RUNTIME: "demo",
        CI: "true",
      },
    });
    const page = await host.firstWindow();
    await page.waitForFunction(() => Boolean(window.computerCat));
    await expect
      .poll(
        async () => (await page.evaluate(() => window.computerCat.info())).models.codex.connected,
      )
      .toBe(true);
    expect(await host.evaluate(({ app }) => app.requestSingleInstanceLock())).toBe(true);
    // Mimic an active login whose persisted file has become unreadable. Never touch a real profile.
    await writeFile(join(directory, "codex-credentials.enc"), "unreadable-offline-vault");
    const result = await execute(
      process.execPath,
      [resolve("scripts/run-live-evals.mjs"), "--check", "--user-data", directory],
      {
        windowsHide: true,
        timeout: 40000,
        env: { ...process.env, CI: "true" },
      },
    );
    expect(result.stdout).toContain(
      "using the running Computer Cat connection. No model request made.",
    );
    expect(result.stdout).toContain("gpt-5.6-luna, medium");
    expect(await readFile(join(directory, "codex-credentials.enc"), "utf8")).toBe(
      "unreadable-offline-vault",
    );
    expect(result.stdout + result.stderr).not.toContain("offline-access-only");
    expect(result.stdout + result.stderr).not.toContain("offline-refresh-only");
    expect((await page.evaluate(() => window.computerCat.info())).models.codex.connected).toBe(
      true,
    );
  } finally {
    await host?.close();
    if (resolve(directory).startsWith(join(tmpdir(), "computercat-eval-auth-")))
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
