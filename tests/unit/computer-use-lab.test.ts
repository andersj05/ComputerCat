import { describe, expect, it } from "vitest";
import {
  comparisonProblems,
  distribution,
  evidenceProblems,
  type LabReport,
  qualified,
  renderReport,
  summarize,
} from "../computer-use/metrics";

function report(): LabReport {
  return {
    version: 2,
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
    planned: [{ id: "owned-0", scenario: "owned", repeat: 0 }],
    issues: [],
    runStatus: "passed",
    attempts: [
      {
        id: "owned-0",
        retry: 0,
        scenario: "owned",
        repeat: 0,
        status: "passed",
        durationMs: 100,
        coverage: [],
        measurements: [
          {
            operation: "fill",
            target: "body",
            outcome: "dispatched",
            totalMs: 100,
            initMs: 10,
            readyMs: 80,
            requestMs: 90,
          },
          {
            operation: "fill",
            target: "body",
            outcome: "rejected:stale",
            totalMs: 100,
            initMs: 10,
            readyMs: 80,
            requestMs: 90,
          },
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

  it.each([
    "duplicate",
    "unknown",
    "wrong repeat",
    "retry",
    "empty",
    "run error",
    "markers",
    "negative",
    "nonfinite",
    "order",
  ])("rejects incomplete or corrupt evidence: %s", (cause) => {
    const run = report();
    const attempt = run.attempts[0];
    const sample = attempt?.measurements[0];
    if (!attempt || !sample) throw new Error("Missing fixture");
    if (cause === "duplicate") {
      run.plannedAttempts = 2;
      run.planned.push({ id: "other", scenario: "other", repeat: 0 });
      run.attempts.push(structuredClone(attempt));
    }
    if (cause === "unknown") attempt.id = "not-planned";
    if (cause === "wrong repeat") attempt.repeat = 1;
    if (cause === "retry") attempt.retry = 1;
    if (cause === "empty") attempt.measurements = [];
    if (cause === "run error") run.issues.push("Playwright reported a run error.");
    if (cause === "markers") delete sample.readyMs;
    if (cause === "negative") sample.totalMs = -1;
    if (cause === "nonfinite") sample.totalMs = Number.NaN;
    if (cause === "order") sample.initMs = sample.totalMs + 1;
    expect(qualified(run)).toBe(false);
    expect(comparisonProblems(report(), run)).not.toEqual([]);
  });

  it("permits documented diagnostic focus refusal but never qualifies it", () => {
    const run = report();
    const attempt = run.attempts[0];
    const sample = attempt?.measurements[0];
    if (!attempt || !sample) throw new Error("Missing fixture");
    run.mode = "diagnostic";
    sample.outcome = "rejected:focus";
    expect(evidenceProblems(run)).not.toEqual([]);
    attempt.coverage.push("Windows denied keyboard focus.");
    expect(evidenceProblems(run)).toEqual([]);
    expect(qualified(run)).toBe(false);
    expect(renderReport(run)).toContain("Windows denied keyboard focus.");
    sample.outcome = "uncertain:failed";
    expect(evidenceProblems(run)).not.toEqual([]);
  });

  it("compares environment values regardless of JSON property order", () => {
    const candidate = report();
    candidate.environment = Object.fromEntries(
      Object.entries(candidate.environment).reverse(),
    ) as LabReport["environment"];
    expect(comparisonProblems(report(), candidate)).toEqual([]);
  });
});
