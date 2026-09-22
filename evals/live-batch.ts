import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FixtureWorld } from "../src/agent/evaluation/fixtures";
import { gradeLiveTask } from "../src/agent/evaluation/grade";
import { LIMITS, LIVE_MODEL, LIVE_REASONING, runLiveTask } from "../src/agent/evaluation/runner";
import { addReview, summarize, taskFor } from "./core.ts";
import { renderReport } from "./report.ts";
import { initializeRun, loadSuite, readRun, saveReview, sourceHash } from "./storage.ts";

export async function runLiveBatch(
  values: { run: string; repeats: number; tasks?: string | undefined },
  root: string,
  auth: { accessToken(signal: AbortSignal): Promise<string> },
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<boolean> {
  const repeats = values.repeats;
  const suite = await loadSuite(root, "live-fixture");
  const tasks =
    values.tasks === "all"
      ? suite.catalog.tasks.map((task) => task.id)
      : (values.tasks ?? "screen-summary,account-followup,clipboard-copy,partial-source-failure")
          .split(",")
          .map((task) => task.trim());
  const { run, folder } = await initializeRun(
    {
      id: values.run,
      mode: "live-fixture",
      connection: "codex",
      model: LIVE_MODEL,
      reasoning: LIVE_REASONING,
      environment: `Controlled fixtures v1; ${process.platform}; requests=${LIMITS.requests}; tools=${LIMITS.toolCalls}; seconds=${LIMITS.seconds}; batch=${LIMITS.batchRequests}`,
      selectedTasks: tasks,
      repeats,
    },
    root,
  );
  const budget = { remaining: LIMITS.batchRequests };
  progress(
    `Running ${run.trials.length} live-model attempts with GPT-6 Luna / Medium; controlled fixtures. Maximum ${LIMITS.batchRequests} model requests per batch.`,
  );
  let tokens = 0;
  let requests = 0;
  let completed = 0;
  let passed = false;
  try {
    for (const trial of run.trials) {
      if (signal.aborted || budget.remaining <= 0) break;
      if (
        run.sourceHash !== (await sourceHash(root)) ||
        run.suiteHash !== (await loadSuite(root, "live-fixture")).suiteHash
      )
        throw new Error(
          "Source or evaluation inputs changed during the batch. Finished attempts were kept; remaining attempts are unscored.",
        );
      const directory = join(folder, "fixtures", trial.taskId, String(trial.attempt));
      const [work, revised, untrusted, todo] = await Promise.all(
        ["work-note.html", "revised-note.html", "untrusted-note.html", "todo.txt"].map((file) =>
          readFile(join(directory, file), "utf8"),
        ),
      );
      if (
        work === undefined ||
        revised === undefined ||
        untrusted === undefined ||
        todo === undefined
      )
        throw new Error("Missing fixture input.");
      const world = new FixtureWorld(trial.taskId, directory, { work, revised, untrusted, todo });
      // Only the host sees refresh credentials; the model runtime receives a short-lived token.
      const token = await auth.accessToken(signal);
      const trace = await runLiveTask(taskFor(run, trial.taskId), world, token, signal, budget);
      const review = gradeLiveTask(world, trace);
      const traceName = `trace-${trial.taskId}-${trial.attempt}.json`;
      await writeFile(
        join(folder, traceName),
        JSON.stringify(
          {
            schemaVersion: 1,
            mode: run.mode,
            model: LIVE_MODEL,
            reasoning: LIVE_REASONING,
            limits: LIMITS,
            taskId: trial.taskId,
            attempt: trial.attempt,
            trace,
            outcome: {
              clipboard: world.clipboard,
              files: Object.fromEntries(world.files),
              violations: world.violations,
            },
            review,
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
      const current = await readRun(run.id, root);
      await saveReview(
        addReview(current.run, trial.taskId, trial.attempt, review),
        current.hash,
        root,
      );
      completed++;
      tokens += trace.usage.total;
      requests += trace.requests;
      progress(
        `${completed}/${run.trials.length} ${trial.taskId}/${trial.attempt}: ${Object.values(review.grades).every((grade) => grade === "pass") ? "PASS" : "FAIL"}; ${trace.requests} requests, ${trace.calls.length} tools, ${trace.usage.total} reported tokens. Trace: ${traceName}`,
      );
      if (trace.error === "Provider or runtime failed") break;
    }
  } finally {
    const current = await readRun(run.id, root);
    const summary = summarize(current.run);
    const report = `${renderReport(current.run)}\nModel requests: ${requests}; provider-reported tokens: ${tokens}. Reasoning tokens are included in output, not added again. Subscription percentage/currency cost is not inferred from token counts.\n`;
    const reportPath = join(folder, `report-${Date.now()}.md`);
    await writeFile(reportPath, report, { flag: "wx" });
    progress(
      `Report: ${reportPath}\nPassed ${summary.passed}/${summary.planned}; reviewed ${summary.reviewed}/${summary.planned}; critical failures ${summary.criticalFailures}.`,
    );
    passed = summary.complete && summary.passed === summary.planned;
  }
  return passed;
}
