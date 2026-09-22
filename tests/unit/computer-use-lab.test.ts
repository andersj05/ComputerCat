import { describe, expect, it } from "vitest";
import {
  comparisonProblems,
  distribution,
  type LabReport,
  qualified,
  summarize,
} from "../computer-use/metrics";

function report(): LabReport {
  return {
    version: 1,
    createdAt: "2026-09-22",
    mode: "strict",
    environment: {
      platform: "win32",
      release: "test",
      arch: "x64",
      cpu: "test",
      node: "24",
      electron: "44",
      playwright: "1",
    },
    revision: { commit: "baseline", dirty: false, helper: "a", fixtures: "same" },
    plannedAttempts: 1,
    runStatus: "passed",
    attempts: [
      {
        scenario: "owned",
        repeat: 0,
        status: "passed",
        durationMs: 100,
        coverage: [],
        measurements: [
          { operation: "fill", target: "body", outcome: "dispatched", totalMs: 100, readyMs: 80 },
          { operation: "fill", target: "body", outcome: "rejected:stale", totalMs: 1 },
        ],
      },
    ],
  };
}

describe("computer-use lab evidence", () => {
  it("reports nearest-rank percentiles without mutating samples or inventing empty results", () => {
    const values = [50, 10, 30, 20, 40];
    expect(distribution(values)).toEqual({ count: 5, p50Ms: 30, p95Ms: 50 });
    expect(values).toEqual([50, 10, 30, 20, 40]);
    expect(distribution([])).toBeNull();
  });

  it("keeps refusal and failed-correctness timings out of successful latency", () => {
    const run = report();
    const attempt = run.attempts[0];
    if (!attempt) throw new Error("Missing fixture");
    attempt.measurements.push({
      operation: "fill",
      target: "body",
      outcome: "rejected:focus",
      totalMs: 2,
    });
    run.attempts.push({
      ...attempt,
      repeat: 1,
      status: "failed",
      measurements: [{ operation: "fill", target: "body", outcome: "dispatched", totalMs: 3 }],
    });
    expect(summarize(run)[0]).toMatchObject({
      latency: { count: 1, p50Ms: 100, p95Ms: 100 },
      outcomes: { dispatched: 2, "rejected:stale": 1, "rejected:focus": 1 },
    });
    expect(qualified(run)).toBe(false);
  });

  it.each(["diagnostic", "missing", "skipped", "interrupted", "coverage"])(
    "does not qualify %s coverage",
    (kind) => {
      const run = report();
      const attempt = run.attempts[0];
      if (!attempt) throw new Error("Missing fixture");
      if (kind === "diagnostic") run.mode = "diagnostic";
      if (kind === "missing") run.plannedAttempts++;
      if (kind === "skipped") attempt.status = "skipped";
      if (kind === "interrupted") run.runStatus = "interrupted";
      if (kind === "coverage") attempt.coverage.push("focus denied");
      expect(qualified(run)).toBe(false);
    },
  );

  it("compares changed helpers but refuses changed environments, fixtures and operation mixes", () => {
    const baseline = report();
    const candidate = report();
    candidate.revision.helper = "b";
    expect(comparisonProblems(baseline, candidate)).toEqual([]);
    candidate.environment.cpu = "different";
    candidate.revision.fixtures = "different";
    candidate.attempts[0]?.measurements.pop();
    expect(comparisonProblems(baseline, candidate)).toHaveLength(3);
  });
});
