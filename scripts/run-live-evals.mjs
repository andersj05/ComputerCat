import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import electron from "electron";
import { build as buildApp } from "electron-vite";
import { build } from "vite";
import { LIVE_HELP, liveOptions } from "../evals/live-options.ts";
import { loadSuite } from "../evals/storage.ts";
import { workerEnvironment } from "../src/agent/config.ts";
import { readEvaluationStatus } from "../src/main/evaluation-jobs.ts";
import { EVALUATION_FLAG, evaluationRequestSchema } from "../src/shared/evaluations.ts";

const options = liveOptions(process.argv.slice(2));
if (options.help) {
  console.log(LIVE_HELP);
} else {
  if (process.env.CI && !options.check)
    throw new Error("Live evaluations are local-only and disabled in CI.");
  const root = resolve(import.meta.dirname, "..");
  process.chdir(root);
  if (options.tasks && options.tasks !== "all") {
    const { catalog } = await loadSuite(root, "live-fixture");
    const selected = options.tasks.split(",").map((task) => task.trim());
    if (
      new Set(selected).size !== selected.length ||
      selected.some((id) => !catalog.tasks.some((task) => task.id === id))
    )
      throw new Error("Choose unique task IDs from evals/live-catalog.json, or --tasks all.");
  }
  // The app owns sign-in; a separate utility worker owns synthetic evaluation state.
  await buildApp({ logLevel: "silent" });
  if (!options.check)
    await build({
      configFile: false,
      publicDir: false,
      logLevel: "warn",
      build: {
        ssr: resolve(root, "evals/live-main.ts"),
        outDir: resolve(root, ".local/eval-runtime"),
        emptyOutDir: false,
        rollupOptions: {
          external: (id) => !id.startsWith(".") && !isAbsolute(id),
          output: { entryFileNames: "main.mjs" },
        },
      },
    });
  const request = evaluationRequestSchema.parse({
    kind: "computer-cat-evaluation",
    job: randomUUID(),
    action: options.check ? "check" : "run",
    run: options.run,
    repeats: options.repeats,
    ...(options.tasks
      ? {
          tasks: options.tasks
            .split(",")
            .map((task) => task.trim())
            .join(","),
        }
      : {}),
    ...(options["user-data"] ? { profile: options["user-data"] } : {}),
  });
  let launchFailed = false;
  const dispatch = (message) => {
    const child = spawn(electron, [root, EVALUATION_FLAG, JSON.stringify(message)], {
      cwd: root,
      windowsHide: true,
      detached: true,
      stdio: "ignore",
      env: { ...workerEnvironment(process.env), ...(process.env.CI ? { CI: "true" } : {}) },
    });
    child.on("error", () => {
      launchFailed = true;
    });
    child.unref();
  };
  let interrupted = false;
  let stopAt;
  const cancel = () => {
    if (interrupted) return;
    interrupted = true;
    stopAt = Date.now() + 40000;
    dispatch({ ...request, action: "cancel" });
    console.log("Stopping evaluations; keeping completed attempts…");
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  let read = 0;
  let received = false;
  const started = Date.now();
  console.log(
    options.check
      ? "Checking Computer Cat's active connection…"
      : `Starting ${request.run} with Luna / Medium…`,
  );
  dispatch(request);
  try {
    while (true) {
      if (launchFailed) throw new Error("Could not launch Computer Cat.");
      const status = await readEvaluationStatus(root, request.job);
      if (status) {
        received = true;
        for (const message of status.messages.slice(read)) console.log(message);
        read = status.messages.length;
        if (status.state !== "running") {
          process.exitCode = interrupted ? 130 : status.state === "passed" ? 0 : 1;
          break;
        }
      }
      if (!received && Date.now() - started > 20000)
        throw new Error(
          "The running app has not loaded evaluation support, or belongs to another checkout. Restart Computer Cat from this checkout once, then retry. Your connection and chats stay in the app profile.",
        );
      if ((stopAt && Date.now() > stopAt) || Date.now() - started > 61 * 60_000)
        throw new Error(
          "Evaluation host stopped responding. Check Computer Cat; completed attempts remain in .local/evals.",
        );
      await delay(250);
    }
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
