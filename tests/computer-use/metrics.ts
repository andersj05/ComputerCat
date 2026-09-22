export interface InputMeasurement {
  operation: string;
  target: string;
  outcome: string;
  totalMs: number;
  initMs?: number | undefined;
  readyMs?: number | undefined;
  requestMs?: number | undefined;
}

export interface LabAttempt {
  scenario: string;
  repeat: number;
  status: string;
  durationMs: number;
  measurements: InputMeasurement[];
  coverage: string[];
}

export interface LabReport {
  version: 1;
  createdAt: string;
  mode: "strict" | "diagnostic";
  environment: {
    platform: string;
    release: string;
    arch: string;
    cpu: string;
    node: string;
    electron: string;
    playwright: string;
  };
  revision: { commit: string; dirty: boolean; helper: string; fixtures: string };
  plannedAttempts: number;
  runStatus: string;
  attempts: LabAttempt[];
}

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

export function qualified(report: LabReport) {
  return (
    report.mode === "strict" &&
    report.runStatus === "passed" &&
    report.plannedAttempts > 0 &&
    report.attempts.length === report.plannedAttempts &&
    report.attempts.every(
      (attempt) =>
        attempt.status === "passed" &&
        attempt.measurements.length > 0 &&
        attempt.coverage.length === 0 &&
        attempt.measurements.every(
          (sample) =>
            sample.outcome === "observed" ||
            sample.outcome === "dispatched" ||
            sample.outcome === "rejected:stale",
        ),
    )
  );
}

export function comparisonProblems(baseline: LabReport, candidate: LabReport) {
  const problems: string[] = [];
  if (!qualified(baseline) || !qualified(candidate))
    problems.push("Both runs must be complete strict passes with no missing keyboard coverage.");
  if (JSON.stringify(baseline.environment) !== JSON.stringify(candidate.environment))
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
  return `# Computer-use lab\n\n${report.mode}; ${report.runStatus}; ${passed}/${report.plannedAttempts} attempts passed. Keyboard qualified: ${qualified(report) ? "yes" : "no"}.\n\nCommit: ${report.revision.commit}${report.revision.dirty ? " (working tree modified)" : ""}.\n\nPlatform: ${report.environment.platform} ${report.environment.release} ${report.environment.arch}; ${report.environment.cpu}; Node ${report.environment.node}; Electron ${report.environment.electron}.\n\n| Operation | All outcomes | Validated samples | p50 ms | p95 ms | Helper ready p50 ms |\n| --- | --- | ---: | ---: | ---: | ---: |\n${rows.join("\n")}\n\nTimings include a fresh helper process, native work, post-action inspection and result parsing. Helper ready is elapsed time to receiving its fixed ready marker, including process startup and script compilation; it is not isolated CPU time. Failed attempts and refusals never contribute to successful latency. Expected stale rejections remain in outcome counts. Each repeat includes its first call; there is no discarded warm-up or persistent helper. Small-sample percentiles are descriptive, not statistical evidence of improvement.\n\nCoverage: owned synthetic windows only; no model, real-account, or full agent-loop success rate.\n`;
}
