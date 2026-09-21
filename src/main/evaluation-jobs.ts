import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type EvaluationStatus, evaluationStatusSchema } from "../shared/evaluations.ts";

export async function evaluationJobDirectory(root: string) {
  const base = await realpath(root);
  let path = base;
  for (const part of [".local", "eval-runtime", "jobs"]) {
    path = join(path, part);
    await mkdir(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const entry = await lstat(path);
    const local = relative(base, await realpath(path));
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      isAbsolute(local) ||
      local === ".." ||
      local.startsWith(`..${sep}`)
    )
      throw new Error("Evaluation jobs must stay inside this checkout.");
  }
  return path;
}
export async function writeEvaluationStatus(root: string, input: EvaluationStatus) {
  const value = evaluationStatusSchema.parse(input);
  const path = join(await evaluationJobDirectory(root), `${value.job}.json`);
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { flag: "wx" });
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, path);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        process.platform !== "win32" ||
        !["EPERM", "EACCES", "EBUSY"].includes(code ?? "") ||
        attempt >= 9
      )
        throw error;
      // A CLI reader or antivirus scanner can briefly hold the destination on Windows.
      await delay(20 * (attempt + 1));
    }
  }
}
export async function readEvaluationStatus(root: string, job: string) {
  evaluationStatusSchema.shape.job.parse(job);
  const path = join(await evaluationJobDirectory(root), `${job}.json`);
  try {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 512 * 1024)
      throw new Error("Invalid evaluation status file.");
    const status = evaluationStatusSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (status.job !== job) throw new Error("Evaluation status identity mismatch.");
    return status;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
