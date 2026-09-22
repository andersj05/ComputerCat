import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { dirname, relative, resolve } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { evidenceProblems, type InputMeasurement, type LabReport, renderReport } from "./metrics";

import { measurementSchema } from "./schema";

function identity(test: TestCase) {
  return {
    id: test.id,
    scenario: `${relative(process.cwd(), test.location.file).replaceAll("\\", "/")}: ${test.titlePath().slice(1).join(" > ")}`,
    repeat: test.repeatEachIndex,
  };
}

export default class ComputerUseReporter implements Reporter {
  private report!: LabReport;
  private output!: string;

  constructor(private readonly options: { outputDir?: string } = {}) {}

  // Playwright does not await onBegin/onTestEnd. Keep initialization and small
  // report writes synchronous so skips and interruption cannot race them.
  onBegin(_config: FullConfig, suite: Suite) {
    const createdAt = new Date().toISOString();
    this.output = resolve(
      this.options.outputDir ?? ".local/computer-use",
      createdAt.replace(/[:.]/g, "-"),
    );
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, ...args],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      ).trim();
    const hash = (paths: string[]) => {
      const digest = createHash("sha256");
      for (const path of paths) digest.update(path).update(readFileSync(path));
      return digest.digest("hex");
    };
    const version = (name: string) =>
      (
        JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")) as {
          version: string;
        }
      ).version;
    this.report = {
      version: 2,
      createdAt,
      mode: process.env.COMPUTERCAT_INPUT_LAB_MODE === "diagnostic" ? "diagnostic" : "strict",
      environment: {
        platform: process.platform,
        release: release(),
        arch: process.arch,
        cpu: cpus()[0]?.model ?? "unknown",
        node: process.version,
        electron: version("electron"),
        playwright: version("@playwright/test"),
      },
      revision: {
        commit: git("rev-parse", "HEAD"),
        dirty: git("status", "--porcelain").length > 0,
        helper: hash([
          "src/main/desktop/windows-input.ts",
          "src/main/desktop/windows-input-script.ts",
        ]),
        fixtures: hash([
          "tests/fixtures/owned-input.ts",
          "tests/fixtures/owned-window.ts",
          "tests/fixtures/computer-input.ps1",
          "tests/fixtures/browser-editor.mjs",
          "tests/smoke/computer-input.spec.ts",
          "tests/smoke/browser-input.spec.ts",
          "tests/computer-use/metrics.ts",
          "tests/computer-use/schema.ts",
          "tests/computer-use/reporter.ts",
          "computer-use.config.ts",
        ]),
      },
      plannedAttempts: suite.allTests().length,
      planned: suite.allTests().map(identity),
      issues: [],
      runStatus: "running",
      attempts: [],
    };
    this.save();
    console.log(`Computer-use lab reports: ${this.output}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (!this.report) return;
    const attachments = result.attachments.filter(
      (item) => item.name === "computer-use-measurements",
    );
    let measurements: InputMeasurement[] = [];
    try {
      const attachment = attachments[0];
      if (attachments.length !== 1 || !attachment)
        throw new Error("Missing measurement attachment");
      const body = attachment.body ?? (attachment.path ? readFileSync(attachment.path) : undefined);
      if (!body) throw new Error("Missing measurement body");
      measurements = measurementSchema
        .array()
        .min(1)
        .parse(JSON.parse(body.toString("utf8")));
    } catch {
      // Preserve the test result and continue reporting; never copy raw attachment contents.
      this.report.issues.push(
        `${identity(test).scenario}: missing or invalid measurement attachment.`,
      );
    }
    this.report.attempts.push({
      ...identity(test),
      retry: result.retry,
      status: result.status,
      durationMs: result.duration,
      measurements,
      coverage: result.annotations
        .filter((item) => item.type === "native-input-coverage")
        .map((item) => item.description ?? "Missing keyboard coverage"),
    });
    this.save();
  }

  async onEnd(result: FullResult) {
    if (!this.report) return { status: "failed" as const };
    this.report.runStatus = result.status;
    const status =
      result.status === "passed" && evidenceProblems(this.report).length > 0
        ? "failed"
        : result.status;
    this.report.runStatus = status;
    this.save();
    console.log(renderReport(this.report));
    return { status };
  }

  onError() {
    if (!this.report) return;
    this.report.issues.push("Playwright reported a run error.");
    this.save();
  }

  private save() {
    mkdirSync(dirname(`${this.output}/report.json`), { recursive: true });
    writeFileSync(`${this.output}/report.json`, `${JSON.stringify(this.report, null, 2)}\n`);
    writeFileSync(`${this.output}/report.md`, renderReport(this.report));
  }
}
