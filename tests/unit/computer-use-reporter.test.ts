import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
      id: "owned-0",
      title: "skipped fixture",
      titlePath: () => ["", "skipped fixture"],
      location: { file: "owned.spec.ts" },
      repeatEachIndex: 0,
    } as TestCase;
    // Match Playwright's synchronous event delivery: awaiting onBegin would hide the race.
    reporter.onBegin({} as FullConfig, { allTests: () => [test] } as Suite);
    reporter.onTestEnd(test, {
      retry: 0,
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

it.each([
  "valid",
  "file attachment",
  "missing",
  "invalid JSON",
  "invalid timing",
  "duplicate attachment",
  "run error",
  "interrupted",
])("preserves report evidence for %s", async (cause) => {
  const outputDir = await mkdtemp(join(tmpdir(), "computercat-lab-reporter-"));
  if (!outputDir.startsWith(join(tmpdir(), "computercat-lab-reporter-")))
    throw new Error("Invalid test directory");
  vi.stubEnv("COMPUTERCAT_INPUT_LAB_MODE", "strict");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const reporter = new ComputerUseReporter({ outputDir });
    const test = {
      id: "owned-0",
      title: "owned fixture",
      titlePath: () => ["", "owned fixture"],
      location: { file: "owned.spec.ts" },
      repeatEachIndex: 0,
    } as TestCase;
    reporter.onBegin({} as FullConfig, { allTests: () => [test] } as Suite);
    const body = Buffer.from(
      cause === "invalid JSON"
        ? "private malformed contents"
        : JSON.stringify([
            {
              operation: "inspect",
              target: "window",
              outcome: "observed",
              totalMs: cause === "invalid timing" ? -1 : 10,
              initMs: 1,
              readyMs: 5,
              requestMs: 8,
            },
          ]),
    );
    const attachment = { name: "computer-use-measurements", contentType: "application/json", body };
    const attachments: TestResult["attachments"] = cause === "missing" ? [] : [attachment];
    if (cause === "duplicate attachment") attachments.push(attachment);
    if (cause === "file attachment") {
      const path = join(outputDir, "measurements.json");
      await writeFile(path, body);
      attachments[0] = { name: attachment.name, contentType: attachment.contentType, path };
    }
    reporter.onTestEnd(test, {
      status: "passed",
      retry: 0,
      duration: 20,
      attachments,
      annotations: [],
    } as unknown as TestResult);
    if (cause === "run error") reporter.onError();
    const passed = ["valid", "file attachment"].includes(cause);
    await expect(
      reporter.onEnd({
        status: cause === "interrupted" ? "interrupted" : "passed",
        duration: 20,
        startTime: new Date(),
      }),
    ).resolves.toEqual({
      status: passed ? "passed" : cause === "interrupted" ? "interrupted" : "failed",
    });
    const directory = (await readdir(outputDir, { withFileTypes: true })).find((entry) =>
      entry.isDirectory(),
    );
    const saved = await readFile(join(outputDir, directory?.name ?? "", "report.json"), "utf8");
    const report = JSON.parse(saved);
    expect(report).toMatchObject({
      version: 2,
      planned: [{ id: "owned-0", repeat: 0 }],
      attempts: [{ id: "owned-0", retry: 0 }],
    });
    expect(saved).not.toContain("private malformed contents");
  } finally {
    log.mockRestore();
    vi.unstubAllEnvs();
    await rm(outputDir, { recursive: true, force: true });
  }
});
