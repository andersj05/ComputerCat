import { compareRuns, type Run, summarize } from "./core.ts";

const cell = (value: string) => value.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const metric = (value: { measured: number; median: number | null }, unit: string) =>
  value.median === null
    ? "not measured"
    : `${value.median}${unit} (measured in ${value.measured} trials)`;
export function renderReport(run: Run) {
  const summary = summarize(run);
  const lines = [
    `# Evaluation: ${run.id}`,
    "",
    run.mode === "scoring-example"
      ? "**SCORING EXAMPLE — synthetic records, not evidence of agent reliability.**"
      : "Human-reviewed attempts in the actual app. The scoring command does not run an agent.",
    "",
    `Model: ${cell(run.connection)} / ${cell(run.model)}; reasoning: ${cell(run.reasoning)}.`,
    `Environment: ${cell(run.environment)}.`,
    `Checkout: ${run.sourceRevision}${run.sourceDirty ? " + working changes" : ""}; application source hash: ${run.sourceHash}.`,
    `Suite hash: ${run.suiteHash}. The worksheet requires running this checkout; a hash does not independently identify an already running app.`,
    "",
    `Reviewed: **${summary.reviewed}/${summary.planned}** planned attempts.`,
    summary.passRate === null
      ? "**Incomplete run: no headline pass rate until all planned criteria are reviewed.**"
      : `Scenario pass rate: **${summary.passed}/${summary.planned} (${percent(summary.passRate)})**.`,
    `Completion scenarios passed: ${summary.completion}/${summary.completionPlanned} planned. Resilience scenarios are reported separately below.`,
    `Tasks passing every planned attempt: ${summary.consistentlyPassingTasks}/${run.selectedTasks.length}.`,
    `Attempts with critical failures: **${summary.criticalFailures}**. Any critical failure needs investigation regardless of the average.`,
    "",
    `Median duration: ${metric(summary.duration, "s")}.`,
    `Median tool calls: ${metric(summary.toolCalls, "")}.`,
    `Median extra user interventions: ${metric(summary.interventions, "")}.`,
    "",
    "| Area | Passed | Reviewed | Planned |",
    "| --- | ---: | ---: | ---: |",
    ...summary.categories.map(
      (row) => `| ${row.category} | ${row.passed} | ${row.reviewed} | ${row.planned} |`,
    ),
    "",
    "| Task | Kind | Attempt | Result | Critical failures | Cause |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...summary.results.map(
      (row) =>
        `| ${row.task.id} | ${row.task.kind} | ${row.trial.attempt} | ${row.verdict}${row.complete ? "" : " (review incomplete)"} | ${row.critical.join(", ") || "—"} | ${row.review?.failureCause ?? "—"} |`,
    ),
    "",
    "## Review evidence",
    "",
  ];
  for (const row of summary.results)
    if (row.review)
      lines.push(
        `### ${row.task.id} / ${row.trial.attempt}`,
        "",
        `Reviewer: ${cell(row.review.reviewer)}; ${row.review.reviewedAt}; ${row.trial.reviews.length} saved review(s).`,
        "",
        cell(row.review.evidence),
        "",
        ...row.task.checks.map(
          (check) => `- ${row.review?.grades[check.id]}: ${check.description}`,
        ),
        "",
      );
  lines.push(
    "These are observations from this suite, model and environment. Small repeated samples do not establish production reliability or statistical significance. Review failures and individual regressions, not only the average.",
    "",
  );
  return lines.join("\n");
}
export function renderComparison(baseline: Run, candidate: Run, allowModelChange = false) {
  const comparison = compareRuns(baseline, candidate, allowModelChange);
  return [
    `# Evaluation comparison: ${baseline.id} → ${candidate.id}`,
    "",
    baseline.mode === "scoring-example"
      ? "**SCORING EXAMPLE — not agent performance.**"
      : "Observed results from human-reviewed app attempts; no statistical significance is implied.",
    "",
    `Baseline model: ${cell(baseline.connection)} / ${cell(baseline.model)} (${cell(baseline.reasoning)}).`,
    `Candidate model: ${cell(candidate.connection)} / ${cell(candidate.model)} (${cell(candidate.reasoning)}).`,
    `Baseline source: ${baseline.sourceHash}. Candidate source: ${candidate.sourceHash}.`,
    baseline.sourceHash === candidate.sourceHash
      ? "The application source hashes match: this measures repeat-run variation or a model/settings change."
      : "Application source hashes differ; inspect the code change alongside these observations.",
    "",
    `Pass rate: ${comparison.baseline.passed}/${comparison.baseline.planned} → ${comparison.candidate.passed}/${comparison.candidate.planned}; observed change ${(comparison.delta * 100).toFixed(1)} percentage points.`,
    `Critical-failure attempts: ${comparison.baseline.criticalFailures} → ${comparison.candidate.criticalFailures}.`,
    `Tasks passing every attempt: ${comparison.baseline.consistentlyPassingTasks} → ${comparison.candidate.consistentlyPassingTasks}.`,
    `Changed attempt outcomes: ${comparison.regressions.length} regressions; ${comparison.improvements.length} improvements. Attempt numbers identify records, not shared random seeds.`,
    "",
    "| Task | Attempt | Before | After |",
    "| --- | ---: | --- | --- |",
    ...comparison.changes.map(
      (change) => `| ${change.taskId} | ${change.attempt} | ${change.before} | ${change.after} |`,
    ),
    "",
    comparison.candidate.criticalFailures
      ? "**Investigate critical failures before release, even if the average improved.**"
      : "No critical failures were recorded in the candidate; this is limited to the reviewed cases.",
    "Inspect all regressions and repeat uncertain cases under the same setup. Do not interpret a small aggregate change as a proven improvement.",
    "",
  ].join("\n");
}
