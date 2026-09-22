import { type LabReport, reportSchema } from "./schema.ts";

export type { InputMeasurement, LabAttempt, LabReport } from "./schema.ts";

export function distribution(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
  return { count: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95) };
}

export function summarize(report: LabReport) {
  const groups = new Map<
    string,
    { timings: number[]; readiness: number[]; outcomes: Record<string, number> }
  >();
  for (const attempt of report.attempts) {
    for (const sample of attempt.measurements) {
      const key = `${attempt.scenario} / ${sample.operation} / ${sample.target}`;
      const group = groups.get(key) ?? { timings: [], readiness: [], outcomes: {} };
      group.outcomes[sample.outcome] = (group.outcomes[sample.outcome] ?? 0) + 1;
      // A dispatched action is not proof of a correct edit. Only the fixture's
      // successful final assertions qualify its observed/dispatched latency.
      if (attempt.status === "passed" && ["observed", "dispatched"].includes(sample.outcome)) {
        group.timings.push(sample.totalMs);
        if (sample.readyMs !== undefined) group.readiness.push(sample.readyMs);
      }
      groups.set(key, group);
    }
  }
  return [...groups.entries()].map(([operation, group]) => ({
    operation,
    latency: distribution(group.timings),
    helperReady: distribution(group.readiness),
    outcomes: group.outcomes,
  }));
}

export function evidenceProblems(report: LabReport): string[] {
  if (!reportSchema.safeParse(report).success) return ["Invalid report or measurement data."];
  const problems = [...report.issues];
  if (report.runStatus !== "passed") problems.push(`Run is ${report.runStatus}.`);
  const planned = new Map(report.planned.map((attempt) => [attempt.id, attempt]));
  const completed = new Set(report.attempts.map((attempt) => attempt.id));
  if (
    !report.plannedAttempts ||
    report.plannedAttempts !== report.planned.length ||
    planned.size !== report.plannedAttempts ||
    completed.size !== report.plannedAttempts ||
    report.attempts.length !== report.plannedAttempts
  )
    problems.push("Planned attempts must each complete exactly once, without retries.");
  for (const attempt of report.attempts) {
    const slot = planned.get(attempt.id);
    if (
      !slot ||
      slot.scenario !== attempt.scenario ||
      slot.repeat !== attempt.repeat ||
      attempt.retry !== 0
    )
      problems.push(`${attempt.scenario}: unexpected attempt or retry.`);
    if (attempt.status !== "passed" || !attempt.measurements.length)
      problems.push(`${attempt.scenario}: missing successful fixture evidence.`);
    if (report.mode === "strict" && attempt.coverage.length)
      problems.push(`${attempt.scenario}: missing native input coverage.`);
    for (const sample of attempt.measurements) {
      const allowed = [
        "observed",
        "dispatched",
        "rejected:stale",
        "rejected:unsupported",
        "rejected:unavailable",
      ];
      if (report.mode === "diagnostic" && attempt.coverage.length) allowed.push("rejected:focus");
      if (!allowed.includes(sample.outcome))
        problems.push(`${attempt.scenario}: unexpected ${sample.outcome} outcome.`);
      if (
        sample.initMs === undefined ||
        sample.readyMs === undefined ||
        sample.requestMs === undefined
      )
        problems.push(`${attempt.scenario}: missing helper timing markers.`);
    }
  }
  return [...new Set(problems)];
}

export function qualified(report: LabReport) {
  return report.mode === "strict" && evidenceProblems(report).length === 0;
}

export function comparisonProblems(baseline: LabReport, candidate: LabReport) {
  const problems: string[] = [];
  if (!qualified(baseline) || !qualified(candidate))
    problems.push("Both runs must be complete strict passes with no missing keyboard coverage.");
  if (
    Object.keys(baseline.environment).some(
      (key) =>
        baseline.environment[key as keyof LabReport["environment"]] !==
        candidate.environment[key as keyof LabReport["environment"]],
    )
  )
    problems.push("Environment differs; rerun on the same host with the same runtime versions.");
  if (baseline.revision.fixtures !== candidate.revision.fixtures)
    problems.push("Fixture or measurement code differs; collect a new baseline.");
  const signature = (report: LabReport) =>
    report.attempts
      .map((attempt) =>
        JSON.stringify([
          attempt.scenario,
          attempt.repeat,
          attempt.measurements.map((sample) => [sample.operation, sample.target, sample.outcome]),
        ]),
      )
      .sort()
      .join("\n");
  if (signature(baseline) !== signature(candidate))
    problems.push("Scenario repetitions, operations or outcomes differ; timing is not comparable.");
  return problems;
}

export function renderReport(report: LabReport) {
  const passed = report.attempts.filter((attempt) => attempt.status === "passed").length;
  const rows = summarize(report).map(
    (row) =>
      `| ${row.operation} | ${Object.entries(row.outcomes)
        .map(([outcome, count]) => `${outcome}: ${count}`)
        .join(
          ", ",
        )} | ${row.latency?.count ?? 0} | ${row.latency?.p50Ms.toFixed(1) ?? "—"} | ${row.latency?.p95Ms.toFixed(1) ?? "—"} | ${row.helperReady?.p50Ms.toFixed(1) ?? "—"} |`,
  );
  const cell = (value: string) => value.replaceAll("|", "\\|").replace(/[\r\n]/g, " ");
  const attempts = report.attempts
    .map(
      (attempt) =>
        `| ${cell(attempt.scenario)} | ${attempt.repeat + 1} | ${attempt.retry} | ${attempt.status} | ${attempt.durationMs.toFixed(1)} | ${cell(attempt.coverage.join("; ")) || "—"} |`,
    )
    .join("\n");
  const issues =
    evidenceProblems(report)
      .map((problem) => `- ${cell(problem)}`)
      .join("\n") || "None.";
  return `# Computer-use lab\n\n${report.mode}; ${report.runStatus}; ${passed}/${report.plannedAttempts} attempts passed. Keyboard qualified: ${qualified(report) ? "yes" : "no"}.\n\nCommit: ${report.revision.commit}${report.revision.dirty ? " (working tree modified)" : ""}.\n\nPlatform: ${report.environment.platform} ${report.environment.release} ${report.environment.arch}; ${report.environment.cpu}; Node ${report.environment.node}; Electron ${report.environment.electron}.\n\n| Operation | All outcomes | Validated samples | p50 ms | p95 ms | Helper ready p50 ms |\n| --- | --- | ---: | ---: | ---: | ---: |\n${rows.join("\n")}\n\n| Attempt | Repeat | Retry | Status | Duration ms | Coverage gap |\n| --- | ---: | ---: | --- | ---: | --- |\n${attempts}\n\nEvidence issues:\n\n${issues}\n\nTimings include a fresh helper process, native work, post-action inspection and result parsing. Helper ready is elapsed time to receiving its fixed ready marker, including process startup and script compilation; it is not isolated CPU time. Failed attempts and refusals never contribute to successful latency. Expected stale rejections remain in outcome counts. Each repeat includes its first call; there is no discarded warm-up or persistent helper. Small-sample percentiles are descriptive, not statistical evidence of improvement.\n\nCoverage: owned synthetic windows only; no model, real-account, or full agent-loop success rate.\n`;
}
