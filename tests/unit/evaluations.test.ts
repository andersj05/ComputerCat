import { describe, expect, it } from "vitest";
import {
  addReview,
  catalogSchema,
  compareRuns,
  type Run,
  runSchema,
  summarize,
} from "../../evals/core.ts";

import { catalog, finished, makeRun, review, task } from "../fixtures/evaluation";

describe("task evaluation scoring", () => {
  it("keeps planned missing trials visible and withholds a headline rate until review is complete", () => {
    const run = addReview(makeRun(), task.id, 1, review("pass"));
    expect(summarize(run)).toMatchObject({
      planned: 2,
      reviewed: 1,
      passed: 1,
      complete: false,
      passRate: null,
      consistentlyPassingTasks: 0,
    });
    const pending = addReview(run, task.id, 2, review("unobserved"));
    expect(summarize(pending).passRate).toBeNull();
    expect(() => compareRuns(run, pending)).toThrow("every planned criterion");
  });
  it("scores outcomes across repetitions instead of reporting a best attempt", () => {
    const summary = summarize(finished(["pass", "fail", "pass"]));
    expect(summary).toMatchObject({
      planned: 3,
      passed: 2,
      passRate: 2 / 3,
      consistentlyPassingTasks: 0,
    });
    expect(summary.completion).toBe(2);
  });
  it("does not turn unknown timing and tool counts into zero", () => {
    let run = makeRun(3);
    run = addReview(run, task.id, 1, review("pass", 10));
    run = addReview(run, task.id, 2, review("pass", null));
    run = addReview(run, task.id, 3, review("pass", 30));
    expect(summarize(run).duration).toEqual({ measured: 2, median: 20 });
    expect(summarize(run).toolCalls).toEqual({ measured: 0, median: null });
  });
  it("preserves review history and requires an explicit correction", () => {
    const baseline = finished(["fail"]);
    expect(() => addReview(baseline, task.id, 1, review("pass"))).toThrow("--revise");
    const corrected = addReview(baseline, task.id, 1, review("pass"), true);
    expect(corrected.trials[0]?.reviews).toHaveLength(2);
    expect(summarize(corrected).passed).toBe(1);
    expect(summarize(baseline).passed).toBe(0);
  });
  it("rejects unknown, missing and duplicate trials or criteria", () => {
    const run = makeRun();
    expect(runSchema.safeParse({ ...run, trials: run.trials.slice(0, 1) }).success).toBe(false);
    expect(runSchema.safeParse({ ...run, trials: [run.trials[0], run.trials[0]] }).success).toBe(
      false,
    );
    expect(() =>
      addReview(run, task.id, 1, { ...review("pass"), grades: { invented: "pass" } }),
    ).toThrow();
    expect(() => addReview(run, task.id, 1, { ...review("fail"), failureCause: null })).toThrow();
    expect(() => addReview(run, task.id, 1, { ...review("pass"), evidence: "" })).toThrow();
  });
  it("reports critical failures separately from the overall rate", () => {
    const run = finished(["fail"]);
    const modified = structuredClone(run);
    const first = modified.catalog.tasks[0]?.checks[0];
    if (!first) throw new Error("Missing criterion");
    first.critical = true;
    expect(summarize(modified).criticalFailures).toBe(1);
    expect(summarize(modified).passRate).toBe(0);
  });
  it("identifies individual improvements and regressions even when the total rate is unchanged", () => {
    const comparison = compareRuns(finished(["pass", "fail"]), finished(["fail", "pass"]));
    expect(comparison.delta).toBe(0);
    expect(comparison.regressions).toMatchObject([{ taskId: task.id, attempt: 1 }]);
    expect(comparison.improvements).toMatchObject([{ taskId: task.id, attempt: 2 }]);
  });
  it("refuses incompatible comparisons and labels intentional model comparisons explicitly", () => {
    const run = finished(["pass"]);
    for (const patch of [
      { suiteHash: "c".repeat(64) },
      { mode: "manual-live" },
      { environment: "different browser" },
      { model: "different model" },
    ]) {
      expect(() => compareRuns(run, { ...run, ...patch } as Run)).toThrow();
    }
    expect(() => compareRuns(run, { ...run, model: "different model" }, true)).not.toThrow();
    expect(() => compareRuns(run, finished(["pass", "pass"]))).toThrow("repeat count");
  });
  it("rejects duplicate task and criterion IDs in the maintained suite", () => {
    expect(catalogSchema.safeParse({ ...catalog, tasks: [task, task] }).success).toBe(false);
    expect(
      catalogSchema.safeParse({
        ...catalog,
        tasks: [{ ...task, checks: [task.checks[0], task.checks[0]] }],
      }).success,
    ).toBe(false);
    expect(catalog.tasks).toHaveLength(15);
  });
});
