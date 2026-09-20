import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  addReview,
  failureCauses,
  type Grade,
  type Review,
  reviewSchema,
  taskFor,
} from "./core.ts";
import { renderComparison, renderReport } from "./report.ts";
import { initializeRun, loadSuite, readRun, saveReview, sourceHash } from "./storage.ts";

const help = `Computer Cat task evaluations — no model calls or desktop access from this CLI.

npm run eval:check
npm run eval:init -- --run baseline --connection codex --model MODEL --reasoning medium --environment "Windows/browser; keyless search" [--tasks screen-summary,account-followup] [--repeats 3]
npm run eval:score -- --run baseline --task screen-summary --attempt 1 [--reviewer INITIALS] [--revise]
npm run eval:report -- --run baseline
npm run eval:compare -- --baseline baseline --candidate candidate [--allow-model-change] [--gate]

Initialization creates a task worksheet and fresh fixtures for every attempt in .local/evals/RUN.
Run tasks yourself in the real app, then grade observed outcomes with eval:score.
Score accepts --review FILE for a structured review instead of interactive questions.
Use --example on init only for synthetic scoring demonstrations; they cannot be compared to real runs.
No reliability baseline exists until the planned attempts have actually been performed and reviewed.`;
const string = { type: "string" } as const;
const boolean = { type: "boolean" } as const;
const specifications = {
  check: {},
  init: {
    run: string,
    connection: string,
    model: string,
    reasoning: string,
    environment: string,
    tasks: string,
    repeats: { ...string, default: "3" },
    example: boolean,
  },
  score: {
    run: string,
    task: string,
    attempt: string,
    reviewer: string,
    review: string,
    revise: boolean,
  },
  report: { run: string },
  compare: { baseline: string, candidate: string, "allow-model-change": boolean, gate: boolean },
} as const;
function required(values: Record<string, unknown>, name: string) {
  const value = values[name];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Provide --${name}. See npm run eval:help.`);
  return value.trim();
}
async function interactiveReview(
  runId: string,
  taskId: string,
  attempt: number,
  reviewer?: string,
): Promise<Review> {
  if (!process.stdin.isTTY)
    throw new Error(
      "Interactive scoring needs a terminal. Supply --review FILE for a structured review.",
    );
  const { run } = await readRun(runId);
  const task = taskFor(run, taskId);
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(
      `\n${task.title} — attempt ${attempt}\nScore the task you actually ran; this command does not run it.\n`,
    );
    const grades: Record<string, Grade> = {};
    for (const check of task.checks) {
      while (true) {
        const answer = (
          await input.question(
            `${check.critical ? "CRITICAL: " : ""}${check.description}\n[p]ass, [f]ail, [u]nobserved (default u): `,
          )
        )
          .trim()
          .toLowerCase();
        if (["", "u", "p", "f", "pass", "fail", "unobserved"].includes(answer)) {
          grades[check.id] =
            answer === "p" || answer === "pass"
              ? "pass"
              : answer === "f" || answer === "fail"
                ? "fail"
                : "unobserved";
          break;
        }
      }
    }
    let evidence = "";
    while (evidence.length < 10 || evidence.length > 3000)
      evidence = (
        await input.question(
          "Evidence: what did you independently inspect? Use a brief synthetic-task observation (10–3000 characters; no secrets/private text): ",
        )
      ).trim();
    const numeric = async (prompt: string, integer: boolean) => {
      while (true) {
        const value = (await input.question(`${prompt} (blank if unknown): `)).trim();
        if (!value) return null;
        const number = Number(value);
        if (
          Number.isFinite(number) &&
          number >= 0 &&
          number <= (integer ? 10000000 : 86400) &&
          (!integer || Number.isInteger(number))
        )
          return number;
      }
    };
    const durationSeconds = await numeric("Task duration in seconds", false);
    const toolCalls = await numeric("Tool calls shown in the app", true);
    const interventions = await numeric("Extra user interventions beyond the task prompts", true);
    let failureCause: Review["failureCause"] = null;
    if (Object.values(grades).includes("fail")) {
      console.log(`Failure categories: ${failureCauses.join(", ")}`);
      while (failureCause === null) {
        const choice =
          (await input.question("Primary cause (blank = unknown): ")).trim() || "unknown";
        const parsed = z.enum(failureCauses).safeParse(choice);
        if (parsed.success) failureCause = parsed.data;
      }
    }
    return reviewSchema.parse({
      reviewedAt: new Date().toISOString(),
      reviewer:
        reviewer ??
        ((await input.question("Reviewer label (blank = local-reviewer): ")).trim() ||
          "local-reviewer"),
      grades,
      evidence,
      durationSeconds,
      toolCalls,
      interventions,
      failureCause,
    });
  } finally {
    input.close();
  }
}

async function main() {
  const command = process.argv[2];
  if (!command || command === "help" || command === "--help") {
    console.log(help);
    return;
  }
  if (!Object.hasOwn(specifications, command))
    throw new Error("Unknown command. Run npm run eval:help.");
  const { values }: { values: Record<string, unknown> } = parseArgs({
    args: process.argv.slice(3),
    options: specifications[command as keyof typeof specifications],
    allowPositionals: false,
  });
  if (command === "check") {
    const suite = await loadSuite();
    const live = await loadSuite(undefined, "live-fixture");
    console.log(
      `Live-fixture definitions valid: ${live.catalog.tasks.length} tasks. No model was run.`,
    );
    console.log(
      `Evaluation definitions valid: ${suite.catalog.tasks.length} tasks, ${suite.catalog.tasks.reduce((sum, task) => sum + task.checks.length, 0)} criteria, ${suite.fixtureFiles.length} fixtures. No agent was run.`,
    );
    return;
  }
  if (command === "init") {
    if (process.stdin.isTTY) {
      const input = createInterface({ input: process.stdin, output: process.stdout });
      try {
        for (const [key, prompt] of [
          ["run", "Run name (e.g. baseline)"],
          ["connection", "Connection shown in the app (e.g. codex)"],
          ["model", "Exact model shown in the app"],
          ["reasoning", "Reasoning setting shown in the app"],
          ["environment", "Windows/browser versions and search configuration (no keys)"],
        ]) {
          if (key && !values[key]) values[key] = (await input.question(`${prompt}: `)).trim();
        }
      } finally {
        input.close();
      }
    }
    const repeats = Number(values.repeats);
    const result = await initializeRun({
      id: required(values, "run"),
      mode: values.example ? "scoring-example" : "manual-live",
      connection: required(values, "connection"),
      model: required(values, "model"),
      reasoning: required(values, "reasoning"),
      environment: required(values, "environment"),
      selectedTasks:
        typeof values.tasks === "string"
          ? values.tasks.split(",").map((value) => value.trim())
          : [],
      repeats,
    });
    console.log(
      `Created ${result.run.trials.length} UNSCORED attempts (${result.run.mode}).\nWorksheet: ${join(result.folder, "tasks.md")}\nRun the app from this checkout with the recorded model/settings. A source hash does not verify an already running app.\nNo model calls, desktop actions or grading occurred.`,
    );
    return;
  }
  if (command === "score") {
    const id = required(values, "run");
    const { run, hash } = await readRun(id);
    if (run.mode === "live-fixture")
      throw new Error(
        "Live-fixture grades come from the runner. Use a fresh run; do not replace measured outcomes with manual scores.",
      );
    const suite = await loadSuite();
    if (run.suiteHash !== suite.suiteHash)
      throw new Error(
        "The evaluation suite/scorer changed. Start a new baseline before recording more attempts.",
      );
    if (run.sourceHash !== (await sourceHash()))
      throw new Error(
        "Application code changed since this run began. Finish comparisons using a new candidate run; do not mix revisions within a run.",
      );
    const task = required(values, "task");
    const attempt = Number(required(values, "attempt"));
    const trial = run.trials.find((trial) => trial.taskId === task && trial.attempt === attempt);
    if (!trial) throw new Error("That task/attempt is not in the planned roster.");
    if (trial.reviews.length && !values.revise)
      throw new Error(
        "Already reviewed. Use --revise for an explicit correction; a new agent attempt needs its own planned slot.",
      );
    const review =
      typeof values.review === "string"
        ? reviewSchema.parse(
            JSON.parse((await readFile(values.review, "utf8")).replace(/^\uFEFF/, "")),
          )
        : await interactiveReview(
            id,
            task,
            attempt,
            typeof values.reviewer === "string" ? values.reviewer : undefined,
          );
    const updated = addReview(run, task, attempt, review, values.revise === true);
    // Recheck after interactive scoring: source or suite edits during review must not mix revisions.
    if (run.sourceHash !== (await sourceHash()) || run.suiteHash !== (await loadSuite()).suiteHash)
      throw new Error("Inputs changed while scoring; the review was not saved.");
    await saveReview(updated, hash);
    console.log(
      `Saved review for ${task}/${attempt}. Prior corrections remain in run.json. Run npm run eval:report -- --run ${id}`,
    );
    return;
  }
  if (command === "report") {
    const { run, folder } = await readRun(required(values, "run"));
    const report = renderReport(run);
    const path = join(folder, `report-${Date.now()}.md`);
    await writeFile(path, report, { flag: "wx" });
    console.log(report);
    console.log(`Report saved: ${path}`);
    return;
  }
  const before = await readRun(required(values, "baseline"));
  const after = await readRun(required(values, "candidate"));
  const report = renderComparison(before.run, after.run, values["allow-model-change"] === true);
  const path = join(after.folder, `comparison-${before.run.id}-${Date.now()}.md`);
  await writeFile(path, report, { flag: "wx" });
  console.log(report);
  console.log(`Comparison saved: ${path}`);
  if (values.gate) {
    const { compareRuns } = await import("./core.ts");
    const comparison = compareRuns(before.run, after.run, values["allow-model-change"] === true);
    if (comparison.candidate.criticalFailures || comparison.regressions.length)
      process.exitCode = 1;
  }
}
await main().catch((error: unknown) => {
  const message =
    error instanceof z.ZodError
      ? `Invalid evaluation data: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`
      : error instanceof Error
        ? error.message
        : "Evaluation command failed.";
  console.error(message);
  process.exitCode = 1;
});
