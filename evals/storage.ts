import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogSchema, type Run, runSchema } from "./core.ts";

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function assertRunId(id: string) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id))
    throw new Error(
      "Run names must start with a lowercase letter and contain only lowercase letters, digits and hyphens (up to 64 characters).",
    );
}
function inside(root: string, path: string) {
  const part = relative(root, path);
  return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`);
}
async function directory(root: string, path: string) {
  await mkdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink() || !inside(root, await realpath(path)))
    throw new Error("Evaluation storage must be a regular directory inside this checkout.");
  return path;
}
export async function storageRoot(root = repository) {
  const resolved = await realpath(root);
  await directory(resolved, join(resolved, ".local"));
  return directory(resolved, join(resolved, ".local", "evals"));
}
async function files(root: string, path: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("Evaluation inputs must not contain symbolic links.");
    if (entry.isDirectory()) result.push(...(await files(root, full)));
    else if (entry.isFile()) result.push(relative(root, full).split(sep).join("/"));
  }
  return result.sort();
}
async function hashFiles(root: string, paths: string[]) {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    const entry = await lstat(join(root, path));
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error("Only regular files can be evaluation inputs.");
    const content = await readFile(join(root, path));
    hash.update(path).update("\0").update(content).update("\0");
  }
  return hash.digest("hex");
}
export async function sourceHash(root = repository) {
  return hashFiles(root, [
    ...(await files(root, join(root, "src"))),
    ...(await files(root, join(root, "assets"))),
    "package.json",
    "package-lock.json",
    "electron.vite.config.ts",
    "electron-builder.yml",
  ]);
}
export async function loadSuite(root = repository) {
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(join(root, "evals/catalog.json"), "utf8")),
  );
  const fixtureFiles = await files(root, join(root, "evals/fixtures"));
  for (const file of ["work-note.html", "revised-note.html", "untrusted-note.html", "todo.txt"]) {
    if (!fixtureFiles.includes(`evals/fixtures/${file}`))
      throw new Error(`Missing fixture: ${file}`);
  }
  for (const task of catalog.tasks)
    for (const text of [...task.setup, ...task.prompts]) {
      if (/\{\{(?!fixtureDir\}\})/.test(text)) throw new Error(`Unknown placeholder in ${task.id}`);
    }
  // Include grading/report code so a scoring change requires a fresh baseline.
  const paths = [
    "evals/core.ts",
    "evals/cli.ts",
    "evals/report.ts",
    "evals/storage.ts",
    ...fixtureFiles,
  ];
  const fixtureHash = await hashFiles(root, paths);
  return { catalog, fixtureFiles, suiteHash: digest(JSON.stringify(catalog) + fixtureHash) };
}
export async function initializeRun(
  options: Pick<
    Run,
    | "id"
    | "mode"
    | "connection"
    | "model"
    | "reasoning"
    | "environment"
    | "selectedTasks"
    | "repeats"
  >,
  root = repository,
) {
  assertRunId(options.id);
  const suite = await loadSuite(root);
  const git = (args: string[]) =>
    execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  const selectedTasks = options.selectedTasks.length
    ? options.selectedTasks
    : suite.catalog.tasks.map((task) => task.id);
  const run = runSchema.parse({
    ...options,
    selectedTasks,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceRevision: git(["rev-parse", "HEAD"]),
    sourceDirty: Boolean(git(["status", "--porcelain"])),
    sourceHash: await sourceHash(root),
    suiteHash: suite.suiteHash,
    catalog: suite.catalog,
    trials: selectedTasks.flatMap((taskId) =>
      Array.from({ length: options.repeats }, (_, i) => ({ taskId, attempt: i + 1, reviews: [] })),
    ),
  });
  const base = await storageRoot(root);
  const folder = join(base, run.id);
  // An existing run is never overwritten, including a partially initialized run.
  await mkdir(folder);
  const prompts: string[] = [
    `# ${run.id}: task worksheet`,
    "",
    `Mode: ${run.mode}. Model: ${run.model}; reasoning: ${run.reasoning}.`,
    "",
    "Run the app from the recorded checkout. Each attempt starts a NEW conversation and fresh fixtures. Follow the setup, send the prompts yourself, inspect the outcome, then use eval:score. The scorer does not execute tasks or invoke a model.",
    "",
  ];
  for (const trial of run.trials) {
    const task = run.catalog.tasks.find((task) => task.id === trial.taskId);
    if (!task) throw new Error("Missing task");
    const destination = join(folder, "fixtures", task.id, String(trial.attempt));
    await mkdir(destination, { recursive: true });
    for (const file of suite.fixtureFiles) {
      const leaf = relative("evals/fixtures", file);
      const target = join(destination, leaf);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, file), target);
    }
    const substitute = (value: string) =>
      value.replaceAll("{{fixtureDir}}", destination.replaceAll("\\", "/"));
    prompts.push(
      `## ${task.title} — attempt ${trial.attempt}`,
      "",
      ...task.setup.map((line) => substitute(line)),
      "",
      ...task.prompts.flatMap((line, i) => [`Prompt ${i + 1}:`, "", `> ${substitute(line)}`, ""]),
      ...task.checks.map(
        (check) => `- ${check.critical ? "**Critical:** " : ""}${check.description}`,
      ),
      "",
      `Score: npm run eval:score -- --run ${run.id} --task ${task.id} --attempt ${trial.attempt}`,
      "",
    );
  }
  await writeFile(join(folder, "tasks.md"), prompts.join("\n"), { flag: "wx" });
  await writeFile(join(folder, "run.json"), `${JSON.stringify(run, null, 2)}\n`, { flag: "wx" });
  return { run, folder };
}
export async function readRun(id: string, root = repository) {
  assertRunId(id);
  const base = await storageRoot(root);
  const folder = join(base, id);
  const entry = await lstat(folder);
  if (!entry.isDirectory() || entry.isSymbolicLink() || !inside(base, await realpath(folder)))
    throw new Error("Invalid run directory.");
  const path = join(folder, "run.json");
  const file = await lstat(path);
  if (!file.isFile() || file.isSymbolicLink() || file.size > 8_000_000)
    throw new Error("Invalid or oversized run file.");
  const raw = await readFile(path, "utf8");
  const run = runSchema.parse(JSON.parse(raw));
  if (run.id !== id) throw new Error("Run identity does not match its folder.");
  return { run, folder, hash: digest(raw) };
}
export async function saveReview(run: Run, expectedHash: string, root = repository) {
  const current = await readRun(run.id, root);
  const lockPath = join(current.folder, "review.lock");
  const lock = await open(lockPath, "wx");
  const temporary = join(current.folder, "run.json.tmp");
  let created = false;
  try {
    const latest = await readRun(run.id, root);
    if (latest.hash !== expectedHash)
      throw new Error("Another review changed this run. Reload before saving.");
    const valid = runSchema.parse(run);
    const serialized = `${JSON.stringify(valid, null, 2)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > 8_000_000)
      throw new Error(
        "Run storage exceeds 8 MB. Use smaller evaluation batches; the existing run was kept.",
      );
    const handle = await open(temporary, "wx");
    created = true;
    try {
      await handle.writeFile(serialized);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, join(current.folder, "run.json"));
    created = false;
  } finally {
    if (created) await rm(temporary);
    await lock.close();
    await rm(lockPath);
  }
}
