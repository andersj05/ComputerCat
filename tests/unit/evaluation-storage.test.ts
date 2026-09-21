import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addReview } from "../../evals/core.ts";
import { renderComparison, renderReport } from "../../evals/report.ts";
import { assertRunId, readRun, saveReview, storageRoot } from "../../evals/storage.ts";
import { finished, makeRun, review, task } from "../fixtures/evaluation";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(join(tmpdir(), "computercat-evaluation-")))
      throw new Error("Unexpected test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "computercat-evaluation-"));
  roots.push(root);
  const base = await storageRoot(root);
  const run = makeRun();
  const folder = join(base, run.id);
  await mkdir(folder);
  await writeFile(join(folder, "run.json"), JSON.stringify(run));
  return { root, run, folder };
}
describe("evaluation storage and reports", () => {
  it("saves review changes atomically and refuses stale concurrent writes without losing evidence", async () => {
    const { root, run, folder } = await setup();
    const first = await readRun(run.id, root);
    const updated = addReview(first.run, task.id, 1, review("fail"));
    await saveReview(updated, first.hash, root);
    await expect(
      saveReview(addReview(first.run, task.id, 2, review("pass")), first.hash, root),
    ).rejects.toThrow("Another review");
    const latest = await readRun(run.id, root);
    expect(latest.run.trials[0]?.reviews).toHaveLength(1);
    expect(latest.run.trials[1]?.reviews).toHaveLength(0);
    await expect(readFile(join(folder, "review.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    await saveReview(addReview(latest.run, task.id, 2, review("pass")), latest.hash, root);
    expect((await readRun(run.id, root)).run.trials[1]?.reviews).toHaveLength(1);
  });
  it("rejects path traversal and run identity mismatches", async () => {
    for (const id of ["../outside", "C:/outside", "a/b", "", "a\\b"])
      expect(() => assertRunId(id)).toThrow();
    const { root, run, folder } = await setup();
    await writeFile(join(folder, "run.json"), JSON.stringify({ ...run, id: "different-run" }));
    await expect(readRun(run.id, root)).rejects.toThrow("identity");
  });
  it("rejects a redirected run directory before reading its contents", async () => {
    const { root } = await setup();
    const destination = join(root, "redirected-fixture");
    await mkdir(destination);
    await symlink(destination, join(root, ".local/evals/redirect"), "junction");
    await expect(readRun("redirect", root)).rejects.toThrow("Invalid run directory");
  });
  it("does not label incomplete or example records as measured live reliability", () => {
    const report = renderReport(makeRun());
    expect(report).toContain("SCORING EXAMPLE");
    expect(report).toContain("Incomplete run");
    expect(report).toContain("not measured");
    expect(report).not.toContain("100.0%");
    const comparison = renderComparison(finished(["pass", "fail"]), finished(["fail", "pass"]));
    expect(comparison).toContain("1 regressions; 1 improvements");
    expect(comparison).toContain("not shared random seeds");
    expect(comparison).toContain("SCORING EXAMPLE");
  });
});
