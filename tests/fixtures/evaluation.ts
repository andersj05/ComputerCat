import { readFileSync } from "node:fs";
import {
  addReview,
  catalogSchema,
  type Review,
  type Run,
  runSchema,
  taskSchema,
} from "../../evals/core.ts";
export const catalog = catalogSchema.parse(
  JSON.parse(readFileSync(new URL("../../evals/catalog.json", import.meta.url), "utf8")),
);
export const task = taskSchema.parse(catalog.tasks[0]);
export function makeRun(repeats = 2): Run {
  return runSchema.parse({
    schemaVersion: 1,
    id: "fixture-baseline",
    mode: "scoring-example",
    createdAt: "2026-09-20T12:00:00.000Z",
    connection: "offline",
    model: "fixture",
    reasoning: "none",
    environment: "owned fixture only",
    sourceRevision: "a".repeat(40),
    sourceHash: "a".repeat(64),
    sourceDirty: false,
    suiteHash: "b".repeat(64),
    catalog,
    selectedTasks: [task.id],
    repeats,
    trials: Array.from({ length: repeats }, (_, i) => ({
      taskId: task.id,
      attempt: i + 1,
      reviews: [],
    })),
  });
}
export function review(
  grade: "pass" | "fail" | "unobserved",
  duration: number | null = null,
): Review {
  return {
    reviewedAt: "2026-09-20T12:01:00.000Z",
    reviewer: "offline-check",
    evidence: "Synthetic grader check; no model or desktop was used.",
    grades: Object.fromEntries(task.checks.map((check) => [check.id, grade])),
    durationSeconds: duration,
    toolCalls: null,
    interventions: null,
    failureCause: grade === "fail" ? "context" : null,
  };
}
export function finished(grades: ("pass" | "fail")[]) {
  let run = makeRun(grades.length);
  for (const [index, grade] of grades.entries())
    run = addReview(run, task.id, index + 1, review(grade));
  return run;
}
