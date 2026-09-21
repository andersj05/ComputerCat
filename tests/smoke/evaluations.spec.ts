import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import electron from "electron";

const execute = promisify(execFile);

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
test("live evaluation preflight reuses an app-created encrypted connection without model calls", async ({}) => {
  test.setTimeout(60_000);
  const directory = await mkdtemp(join(tmpdir(), "computercat-eval-auth-"));
  try {
    await execute(
      electron as unknown as string,
      [resolve("tests/fixtures/evaluation-vault.cjs"), directory],
      {
        windowsHide: true,
        timeout: 20000,
      },
    );
    const before = await readFile(join(directory, "codex-credentials.enc"));
    const result = await execute(
      process.execPath,
      [resolve("scripts/run-live-evals.mjs"), "--check", "--user-data", directory],
      {
        windowsHide: true,
        timeout: 30000,
        env: { ...process.env, CI: "true" },
      },
    );
    expect(result.stdout).toContain("Computer Cat sign-in found. No model request made.");
    expect(result.stdout).toContain("gpt-5.6-luna, medium");
    expect(await readFile(join(directory, "codex-credentials.enc"))).toEqual(before);
    expect(result.stdout + result.stderr).not.toContain("offline-access-only");
    expect(result.stdout + result.stderr).not.toContain("offline-refresh-only");
  } finally {
    if (resolve(directory).startsWith(join(tmpdir(), "computercat-eval-auth-")))
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
