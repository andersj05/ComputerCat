import { readFile } from "node:fs/promises";
import { z } from "zod";
import { comparisonProblems, summarize } from "./metrics.ts";

const ms = z.number().finite().nonnegative();
const reportSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  mode: z.enum(["strict", "diagnostic"]),
  environment: z.object({
    platform: z.string(),
    release: z.string(),
    arch: z.string(),
    cpu: z.string(),
    node: z.string(),
    electron: z.string(),
    playwright: z.string(),
  }),
  revision: z.object({
    commit: z.string(),
    dirty: z.boolean(),
    helper: z.string(),
    fixtures: z.string(),
  }),
  plannedAttempts: z.int().positive(),
  runStatus: z.string(),
  attempts: z.array(
    z.object({
      scenario: z.string(),
      repeat: z.int().nonnegative(),
      status: z.string(),
      durationMs: ms,
      coverage: z.array(z.string()),
      measurements: z.array(
        z.object({
          operation: z.string(),
          target: z.string(),
          outcome: z.string(),
          totalMs: ms,
          initMs: ms.optional(),
          readyMs: ms.optional(),
          requestMs: ms.optional(),
        }),
      ),
    }),
  ),
});

async function main() {
  const [baselinePath, candidatePath, extra] = process.argv.slice(2);
  if (!baselinePath || !candidatePath || extra)
    throw new Error(
      "Usage: npm run test:computer-use:compare -- <baseline/report.json> <candidate/report.json>",
    );
  const read = async (path: string) => reportSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const baseline = await read(baselinePath);
  const candidate = await read(candidatePath);
  const problems = comparisonProblems(baseline, candidate);
  if (problems.length) throw new Error(problems.join("\n"));
  const before = new Map(summarize(baseline).map((row) => [row.operation, row]));
  console.log("| Operation | Baseline p50 ms | Candidate p50 ms | Change | Candidate p95 ms |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (const row of summarize(candidate)) {
    const old = before.get(row.operation)?.latency;
    const next = row.latency;
    if (!old || !next) continue;
    const change = old.p50Ms > 0 ? `${((next.p50Ms / old.p50Ms - 1) * 100).toFixed(1)}%` : "n/a";
    console.log(
      `| ${row.operation} | ${old.p50Ms.toFixed(1)} | ${next.p50Ms.toFixed(1)} | ${change} | ${next.p95Ms.toFixed(1)} |`,
    );
  }
  console.log(
    "\nNegative change means faster. These descriptive samples are not a statistical regression gate. Keep desktop load, display configuration and power mode fixed; compare repeated runs.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not compare lab reports.");
  process.exitCode = 1;
});
