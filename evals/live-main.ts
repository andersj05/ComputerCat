import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app, safeStorage } from "electron";
import { CodexAuth } from "../src/agent/codex-auth";
import { FixtureWorld } from "../src/agent/evaluation/fixtures";
import { gradeLiveTask } from "../src/agent/evaluation/grade";
import { LIMITS, LIVE_MODEL, LIVE_REASONING, runLiveTask } from "../src/agent/evaluation/runner";
import { EncryptedSecretStore } from "../src/main/secret-store";
import { addReview, summarize, taskFor } from "./core.ts";
import { LIVE_HELP, liveOptions } from "./live-options.ts";
import { renderReport } from "./report.ts";
import { initializeRun, loadSuite, readRun, saveReview, sourceHash } from "./storage.ts";

async function main() {
  const values = liveOptions(process.argv.slice(2));
  if (
    process.env.COMPUTERCAT_LIVE_EVAL !== "1" ||
    (process.env.CI && !values.check && !values.help)
  )
    throw new Error("Use npm run eval:live locally.");
  if (values.help) {
    console.log(LIVE_HELP);
    return;
  }
  const abort = new AbortController();
  process.stdin.setEncoding("utf8");
  let controlInput = "";
  process.stdin.on("data", (chunk) => {
    controlInput = (controlInput + String(chunk)).slice(-32);
    if (controlInput.includes("cancel\n")) abort.abort();
  });
  const root = resolve(process.cwd());
  const userData = values["user-data"]
    ? resolve(values["user-data"])
    : join(app.getPath("appData"), "Computer Cat");
  app.setName("Computer Cat");
  app.setPath("userData", userData);
  // Share the app lock so two processes cannot rotate the same refresh token concurrently.
  if (!values.check && !app.requestSingleInstanceLock())
    throw new Error(
      "Quit Computer Cat before running live evaluations, then retry. Its chats and model defaults are preserved.",
    );
  // Windows stores the safeStorage encryption key in the profile's Local State.
  // A separate session directory cannot decrypt an app-created credential.
  app.setPath("sessionData", userData);
  await app.whenReady();
  const auth = new CodexAuth(
    new EncryptedSecretStore(join(userData, "codex-credentials.enc"), {
      available: () =>
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    }),
    async () => {
      throw new Error("Sign in through Computer Cat first.");
    },
    () => {},
  );
  try {
    await auth.load();
    const supported = auth
      .catalog()
      .some((model) => model.id === LIVE_MODEL && model.reasoning.includes(LIVE_REASONING));
    if (!supported)
      throw new Error(
        "The pinned SDK does not offer Luna with Medium reasoning. No fallback model will be used.",
      );
    if (!auth.snapshot().connected) {
      const problem = auth.snapshot().message
        ? "Could not unlock the saved Computer Cat connection. If the app shows Connected, preserve its profile and check that this path matches the running app before changing sign-in."
        : "No Computer Cat connection is saved in this profile. Connect in Computer Cat → Options → Models first.";
      throw new Error(
        `${problem}\nProfile: ${userData}\nNo model request made. No credential was removed or replaced.`,
      );
    }
    if (values.check) {
      console.log(
        `Ready: ${LIVE_MODEL}, ${LIVE_REASONING}; Computer Cat sign-in found. No model request made.`,
      );
      return;
    }
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
    console.log(
      `Running ${run.trials.length} live-model attempts with Luna / Medium; controlled fixtures. Maximum ${LIMITS.batchRequests} model requests per batch.`,
    );
    const interrupt = () => abort.abort();
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    let tokens = 0;
    let requests = 0;
    let completed = 0;
    try {
      for (const trial of run.trials) {
        if (abort.signal.aborted || budget.remaining <= 0) break;
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
        const token = await auth.accessToken(abort.signal);
        const trace = await runLiveTask(
          taskFor(run, trial.taskId),
          world,
          token,
          abort.signal,
          budget,
        );
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
        console.log(
          `${completed}/${run.trials.length} ${trial.taskId}/${trial.attempt}: ${Object.values(review.grades).every((grade) => grade === "pass") ? "PASS" : "FAIL"}; ${trace.requests} requests, ${trace.calls.length} tools, ${trace.usage.total} reported tokens. Trace: ${traceName}`,
        );
        if (trace.error === "Provider or runtime failed") break;
      }
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
      const current = await readRun(run.id, root);
      const summary = summarize(current.run);
      const report = `${renderReport(current.run)}\nModel requests: ${requests}; provider-reported tokens: ${tokens}. Reasoning tokens are included in output, not added again. Subscription percentage/currency cost is not inferred from token counts.\n`;
      const reportPath = join(folder, `report-${Date.now()}.md`);
      await writeFile(reportPath, report, { flag: "wx" });
      console.log(
        `Report: ${reportPath}\nPassed ${summary.passed}/${summary.planned}; reviewed ${summary.reviewed}/${summary.planned}; critical failures ${summary.criticalFailures}.`,
      );
      if (!summary.complete || summary.passed !== summary.planned) process.exitCode = 1;
    }
  } finally {
    auth.dispose();
  }
}
void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Live evaluation failed.");
    process.exitCode = 1;
  })
  .finally(() => app.exit(Number(process.exitCode ?? 0)));
