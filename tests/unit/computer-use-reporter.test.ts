import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FullConfig, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { expect, it, vi } from "vitest";
import ComputerUseReporter from "../computer-use/reporter";

it("records immediately skipped tests without a startup race and fails strict qualification", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "computercat-lab-reporter-"));
  if (!outputDir.startsWith(join(tmpdir(), "computercat-lab-reporter-")))
    throw new Error("Invalid reporter test directory");
  vi.stubEnv("COMPUTERCAT_INPUT_LAB_MODE", "strict");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const reporter = new ComputerUseReporter({ outputDir });
    const test = {
      title: "skipped fixture",
      location: { file: "owned.spec.ts" },
      repeatEachIndex: 0,
    } as TestCase;
    // Match Playwright's synchronous event delivery: awaiting onBegin would hide the race.
    reporter.onBegin({} as FullConfig, { allTests: () => [test] } as Suite);
    reporter.onTestEnd(test, {
      status: "skipped",
      duration: 0,
      attachments: [],
      annotations: [],
    } as unknown as TestResult);
    await expect(
      reporter.onEnd({ status: "passed", duration: 0, startTime: new Date() }),
    ).resolves.toEqual({
      status: "failed",
    });
    const directories = await readdir(outputDir);
    expect(directories).toHaveLength(1);
    const report = JSON.parse(
      await readFile(join(outputDir, directories[0] ?? "", "report.json"), "utf8"),
    );
    expect(report).toMatchObject({
      plannedAttempts: 1,
      runStatus: "failed",
      attempts: [{ status: "skipped", measurements: [] }],
    });
  } finally {
    log.mockRestore();
    vi.unstubAllEnvs();
    await rm(outputDir, { recursive: true, force: true });
  }
});
