import { defineConfig } from "@playwright/test";

const mode = process.env.COMPUTERCAT_INPUT_LAB_MODE ?? "strict";
if (!["strict", "diagnostic"].includes(mode))
  throw new Error("Lab mode must be strict or diagnostic.");
process.env.COMPUTERCAT_REQUIRE_NATIVE_FOCUS = mode === "strict" ? "1" : "0";

export default defineConfig({
  testDir: "tests/smoke",
  testMatch: ["computer-input.spec.ts", "browser-input.spec.ts"],
  globalSetup: "./tests/computer-use/setup.ts",
  fullyParallel: false,
  workers: 1,
  repeatEach: 3,
  retries: 0,
  timeout: 150_000,
  outputDir: "test-results/computer-use-lab",
  reporter: [["list"], ["./tests/computer-use/reporter.ts"]],
});
