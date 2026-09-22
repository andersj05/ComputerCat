import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { basename, dirname, resolve } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { type InputMeasurement, type LabReport, qualified, renderReport } from "./metrics";

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
      version: 1,
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
          "tests/computer-use/reporter.ts",
          "computer-use.config.ts",
        ]),
      },
      plannedAttempts: suite.allTests().length,
      runStatus: "running",
      attempts: [],
    };
    this.save();
    console.log(`Computer-use lab reports: ${this.output}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (!this.report) return;
    const attachment = result.attachments.find((item) => item.name === "computer-use-measurements");
    let measurements: InputMeasurement[] = [];
    if (attachment?.body) measurements = JSON.parse(attachment.body.toString("utf8"));
    this.report.attempts.push({
      scenario: `${basename(test.location.file, ".spec.ts")}: ${test.title}`,
      repeat: test.repeatEachIndex,
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
      result.status === "passed" && this.report.mode === "strict" && !qualified(this.report)
        ? "failed"
        : result.status;
    this.report.runStatus = status;
    this.save();
    console.log(renderReport(this.report));
    return { status };
  }

  private save() {
    mkdirSync(dirname(`${this.output}/report.json`), { recursive: true });
    writeFileSync(`${this.output}/report.json`, `${JSON.stringify(this.report, null, 2)}\n`);
    writeFileSync(`${this.output}/report.md`, renderReport(this.report));
  }
}
