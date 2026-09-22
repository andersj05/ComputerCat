import { z } from "zod";

const ms = z.number().finite().nonnegative();
const label = z.string().min(1);
export const measurementSchema = z
  .strictObject({
    operation: z.enum(["inspect", "inspect-search", "click", "fill", "type", "key", "scroll"]),
    target: label,
    outcome: z.enum([
      "observed",
      "dispatched",
      "error",
      "rejected:stale",
      "rejected:user-input",
      "rejected:unavailable",
      "rejected:unsupported",
      "rejected:focus",
      "rejected:failed",
      "uncertain:failed",
      "uncertain:focus",
      "uncertain:user-input",
      "uncertain:stale",
      "uncertain:unavailable",
      "uncertain:unsupported",
    ]),
    totalMs: ms,
    initMs: ms.optional(),
    readyMs: ms.optional(),
    requestMs: ms.optional(),
  })
  .superRefine((sample, context) => {
    const markers = [sample.initMs, sample.readyMs, sample.requestMs, sample.totalMs].filter(
      (value): value is number => value !== undefined,
    );
    if (markers.some((value, index) => index > 0 && value < (markers[index - 1] ?? 0)))
      context.addIssue({
        code: "custom",
        message: "Helper markers must be ordered within total latency.",
      });
  });

const plannedAttemptSchema = z.strictObject({
  id: label,
  scenario: label,
  repeat: z.int().nonnegative(),
});
export const reportSchema = z.strictObject({
  version: z.literal(2),
  createdAt: label,
  mode: z.enum(["strict", "diagnostic"]),
  environment: z.strictObject({
    platform: label,
    release: label,
    arch: label,
    cpu: label,
    node: label,
    electron: label,
    playwright: label,
  }),
  revision: z.strictObject({ commit: label, dirty: z.boolean(), helper: label, fixtures: label }),
  plannedAttempts: z.int().nonnegative(),
  planned: z.array(plannedAttemptSchema),
  runStatus: z.enum(["running", "passed", "failed", "timedout", "interrupted"]),
  issues: z.array(label),
  attempts: z.array(
    plannedAttemptSchema.extend({
      retry: z.int().nonnegative(),
      status: z.enum(["passed", "failed", "timedOut", "skipped", "interrupted"]),
      durationMs: ms,
      coverage: z.array(label),
      measurements: z.array(measurementSchema),
    }),
  ),
});

export type InputMeasurement = z.infer<typeof measurementSchema>;
export type LabReport = z.infer<typeof reportSchema>;
export type LabAttempt = LabReport["attempts"][number];
