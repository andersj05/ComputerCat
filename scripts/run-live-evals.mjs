import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import electron from "electron";
import { build } from "vite";
import { workerEnvironment } from "../src/agent/config.ts";

// Separate from verify/CI: invoking this command explicitly enables live subscription usage.
if (process.env.CI) throw new Error("Live evaluations are local-only and disabled in CI.");
const root = resolve(import.meta.dirname, "..");
process.chdir(root);
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
const child = spawn(
  electron,
  [resolve(root, ".local/eval-runtime/main.mjs"), ...process.argv.slice(2)],
  {
    cwd: root,
    windowsHide: true,
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...workerEnvironment(process.env),
      COMPUTERCAT_LIVE_EVAL: "1",
      PI_CODING_AGENT_DIR: resolve(root, ".local/eval-runtime/pi"),
    },
  },
);
child.stdin?.on("error", () => {}); // The host may already be exiting when cancellation is sent.
let interrupted = false;
let forceStop;
process.on("SIGINT", () => {
  interrupted = true;
  child.stdin?.write("cancel\n");
  forceStop ??= setTimeout(() => child.kill(), 35_000);
  forceStop.unref();
});
child.on("error", () => {
  console.error("Could not start the local Electron evaluation host.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  clearTimeout(forceStop);
  process.exitCode = interrupted ? 130 : (code ?? 1);
});
