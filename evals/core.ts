import { z } from "zod";

const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const unique = (items: string[]) => new Set(items).size === items.length;
const checkSchema = z.strictObject({
  id: identifier,
  description: z.string().min(10).max(800),
  critical: z.boolean().default(false),
});
export const taskSchema = z
  .strictObject({
    id: identifier,
    title: z.string().min(5).max(160),
    category: z.enum(["context", "research", "actions", "recovery"]),
    kind: z.enum(["completion", "resilience"]),
    setup: z.array(z.string().min(10).max(2000)).min(1).max(8),
    prompts: z.array(z.string().min(5).max(2000)).min(1).max(5),
    checks: z.array(checkSchema).min(2).max(12),
  })
  .refine((task) => unique(task.checks.map((check) => check.id)), "Duplicate criterion ID");
export const catalogSchema = z
  .strictObject({
    version: z.number().int().positive(),
    name: z.string().min(5).max(160),
    tasks: z.array(taskSchema).min(1).max(100),
  })
  .refine((catalog) => unique(catalog.tasks.map((task) => task.id)), "Duplicate task ID");
export type Catalog = z.infer<typeof catalogSchema>;
export type Task = z.infer<typeof taskSchema>;
export const gradeSchema = z.enum(["pass", "fail", "unobserved"]);
export type Grade = z.infer<typeof gradeSchema>;
export const failureCauses = [
  "context",
  "tool-choice",
  "tool-execution",
  "recovery",
  "unsupported-claim",
  "instruction-following",
  "environment",
  "unknown",
] as const;
const count = z.number().int().min(0).max(10000000).nullable();
export const reviewSchema = z.strictObject({
  reviewedAt: z.iso.datetime(),
  reviewer: z.string().trim().min(1).max(100),
  grades: z.record(identifier, gradeSchema),
  evidence: z.string().trim().min(10).max(3000),
  durationSeconds: z.number().min(0).max(86400).nullable(),
  toolCalls: count,
  interventions: count,
  failureCause: z.enum(failureCauses).nullable(),
});
export type Review = z.infer<typeof reviewSchema>;
const trialSchema = z.strictObject({
  taskId: identifier,
  attempt: z.number().int().min(1).max(20),
  reviews: z.array(reviewSchema).max(20),
});
export const runSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: identifier,
    mode: z.enum(["manual-live", "scoring-example", "live-fixture"]),
    createdAt: z.iso.datetime(),
    connection: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(160),
    reasoning: z.string().trim().min(1).max(80),
    environment: z.string().trim().min(5).max(500),
    sourceRevision: z.string().regex(/^[0-9a-f]{40,64}$/),
    sourceDirty: z.boolean(),
    sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
    suiteHash: z.string().regex(/^[0-9a-f]{64}$/),
    catalog: catalogSchema,
    selectedTasks: z.array(identifier).min(1).max(100),
    repeats: z.number().int().min(1).max(20),
    trials: z.array(trialSchema).min(1).max(2000),
  })
  .superRefine((run, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!unique(run.selectedTasks)) add("Duplicate selected task");
    if (!unique(run.trials.map((trial) => `${trial.taskId}/${trial.attempt}`)))
      add("Duplicate trial");
    if (run.trials.length !== run.selectedTasks.length * run.repeats)
      add("Incomplete trial roster");
    for (const id of run.selectedTasks) {
      if (!run.catalog.tasks.some((task) => task.id === id)) add(`Unknown selected task: ${id}`);
      for (let attempt = 1; attempt <= run.repeats; attempt++) {
        if (!run.trials.some((trial) => trial.taskId === id && trial.attempt === attempt))
          add(`Missing planned trial: ${id}/${attempt}`);
      }
    }
    for (const trial of run.trials) {
      const task = run.catalog.tasks.find((task) => task.id === trial.taskId);
      if (!task || !run.selectedTasks.includes(trial.taskId) || trial.attempt > run.repeats) {
        add("Unexpected trial");
        continue;
      }
      const expected = task.checks
        .map((check) => check.id)
        .sort()
        .join(",");
      for (const review of trial.reviews) {
        if (Object.keys(review.grades).sort().join(",") !== expected)
          add(`Missing or extra criteria for ${task.id}`);
        const failed = Object.values(review.grades).includes("fail");
        if (failed !== (review.failureCause !== null))
          add("A failed review needs a failure cause; a non-failed review must not have one");
      }
    }
  });
export type Run = z.infer<typeof runSchema>;

export function taskFor(run: Run, id: string): Task {
  const task = run.catalog.tasks.find((task) => task.id === id && run.selectedTasks.includes(id));
  if (!task) throw new Error(`Task is not in this run: ${id}`);
  return task;
}
export function trialResult(run: Run, trial: Run["trials"][number]) {
  const task = taskFor(run, trial.taskId);
  const review = trial.reviews.at(-1);
  const complete = Boolean(
    review &&
      task.checks.every((check) => ["pass", "fail"].includes(review.grades[check.id] ?? "")),
  );
  const failed = task.checks.filter((check) => review?.grades[check.id] === "fail");
  return {
    task,
    trial,
    review,
    complete,
    verdict: failed.length ? "fail" : complete ? "pass" : "pending",
    critical: failed.filter((check) => check.critical).map((check) => check.id),
  } as const;
}
export function addReview(
  input: Run,
  taskId: string,
  attempt: number,
  review: Review,
  revise = false,
): Run {
  const run = structuredClone(runSchema.parse(input));
  const trial = run.trials.find((item) => item.taskId === taskId && item.attempt === attempt);
  if (!trial)
    throw new Error("Unknown task/attempt. The planned roster cannot change after initialization.");
  if (trial.reviews.length && !revise)
    throw new Error(
      "This attempt already has a review. Use --revise to append a correction and preserve its history.",
    );
  trial.reviews.push(reviewSchema.parse(review));
  return runSchema.parse(run);
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length
    ? ((sorted[middle] ?? 0) + (sorted[(sorted.length - 1) >> 1] ?? 0)) / 2
    : null;
}
export function summarize(input: Run) {
  const run = runSchema.parse(input);
  const results = run.trials.map((trial) => trialResult(run, trial));
  const reviewed = results.filter((result) => result.complete);
  const metrics = (key: "durationSeconds" | "toolCalls" | "interventions") => {
    const values = reviewed.flatMap((result) => {
      const value = result.review?.[key];
      return value == null ? [] : [value];
    });
    return { measured: values.length, median: median(values) };
  };
  const categories = [
    ...new Set(
      run.catalog.tasks
        .filter((task) => run.selectedTasks.includes(task.id))
        .map((task) => task.category),
    ),
  ].map((category) => {
    const items = results.filter((result) => result.task.category === category);
    return {
      category,
      passed: items.filter((result) => result.verdict === "pass").length,
      reviewed: items.filter((result) => result.complete).length,
      planned: items.length,
    };
  });
  const passed = results.filter((result) => result.verdict === "pass").length;
  const complete = reviewed.length === results.length;
  return {
    results,
    planned: results.length,
    reviewed: reviewed.length,
    passed,
    complete,
    passRate: complete ? passed / results.length : null,
    criticalFailures: results.filter((result) => result.critical.length > 0).length,
    consistentlyPassingTasks: run.selectedTasks.filter((id) =>
      results
        .filter((result) => result.task.id === id)
        .every((result) => result.verdict === "pass"),
    ).length,
    completion: results.filter(
      (result) => result.task.kind === "completion" && result.verdict === "pass",
    ).length,
    completionPlanned: results.filter((result) => result.task.kind === "completion").length,
    categories,
    duration: metrics("durationSeconds"),
    toolCalls: metrics("toolCalls"),
    interventions: metrics("interventions"),
  };
}
export function compareRuns(before: Run, after: Run, allowModelChange = false) {
  const baseline = runSchema.parse(before);
  const candidate = runSchema.parse(after);
  if (baseline.mode !== candidate.mode)
    throw new Error("Cannot compare example data with real app evaluations.");
  if (
    baseline.suiteHash !== candidate.suiteHash ||
    JSON.stringify(baseline.catalog) !== JSON.stringify(candidate.catalog)
  )
    throw new Error("The tasks, rubric or fixtures changed. Create a new baseline for this suite.");
  if (
    [...baseline.selectedTasks].sort().join(",") !==
      [...candidate.selectedTasks].sort().join(",") ||
    baseline.repeats !== candidate.repeats
  )
    throw new Error("Comparisons require the same task roster and repeat count.");
  if (baseline.environment !== candidate.environment)
    throw new Error(
      "The environment labels differ. Compare under matching desktop/browser/search conditions.",
    );
  if (
    !allowModelChange &&
    (["connection", "model", "reasoning"] as const).some((key) => baseline[key] !== candidate[key])
  )
    throw new Error(
      "Model settings differ. Use --allow-model-change only for an intentional model comparison.",
    );
  const left = summarize(baseline);
  const right = summarize(candidate);
  if (!left.complete || !right.complete)
    throw new Error(
      "Finish reviewing every planned criterion in both runs before comparing. Missing evidence is not a pass.",
    );
  const changes = right.results.flatMap((result) => {
    const previous = left.results.find(
      (item) => item.task.id === result.task.id && item.trial.attempt === result.trial.attempt,
    );
    if (!previous) throw new Error("Mismatched trial roster");
    return previous.verdict === result.verdict
      ? []
      : [
          {
            taskId: result.task.id,
            attempt: result.trial.attempt,
            before: previous.verdict,
            after: result.verdict,
          },
        ];
  });
  return {
    baseline: left,
    candidate: right,
    changes,
    delta: (right.passRate ?? 0) - (left.passRate ?? 0),
    regressions: changes.filter((change) => change.after === "fail"),
    improvements: changes.filter((change) => change.after === "pass"),
  };
}
