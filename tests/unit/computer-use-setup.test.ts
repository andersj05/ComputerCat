import type { FullConfig } from "@playwright/test";
import { expect, it } from "vitest";
import validateLabExecution from "../computer-use/setup";

function configuration(workers: number, retries: number[]) {
  return { workers, projects: retries.map((retries) => ({ retries })) } as FullConfig;
}

it("accepts serial execution with zero retries across all projects", () => {
  expect(() => validateLabExecution(configuration(1, [0, 0]))).not.toThrow();
});

it.each([0, 2, 8])("refuses a worker override of %i before opening any windows", (workers) => {
  expect(() => validateLabExecution(configuration(workers, [0]))).toThrow("exactly one worker");
});

it.each([[1], [0, 2]])("refuses retry overrides across projects: %j", (...retries) => {
  expect(() => validateLabExecution(configuration(1, retries))).toThrow("zero retries");
});
