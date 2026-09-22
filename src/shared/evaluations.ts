import { z } from "zod";

export const EVALUATION_FLAG = "--computer-cat-evaluation";
export const EVALUATION_MODEL = "gpt-6-luna";
export const EVALUATION_REASONING = "medium";
export const evaluationRequestSchema = z.strictObject({
  kind: z.literal("computer-cat-evaluation"),
  job: z.uuid(),
  action: z.enum(["run", "check", "cancel"]),
  run: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  repeats: z.number().int().min(1).max(3),
  tasks: z
    .string()
    .regex(/^(all|[a-z][a-z0-9-]*(,[a-z][a-z0-9-]*)*)$/)
    .max(1024)
    .optional(),
  profile: z.string().min(1).max(1024).optional(),
});
export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;
export function evaluationFromArguments(args: string[]): EvaluationRequest | undefined {
  const index = args.indexOf(EVALUATION_FLAG);
  if (index < 0) return;
  const input = args[index + 1];
  if (!input || input.length > 4096) throw new Error("Invalid evaluation launch request.");
  return evaluationRequestSchema.parse(JSON.parse(input));
}
export const evaluationStatusSchema = z.strictObject({
  job: z.uuid(),
  state: z.enum(["running", "passed", "failed"]),
  messages: z.array(z.string().max(4000)).max(100),
});
export type EvaluationStatus = z.infer<typeof evaluationStatusSchema>;
export const evaluationWorkerEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("token-request"), id: z.uuid() }),
  z.strictObject({ type: z.literal("progress"), message: z.string().max(4000) }),
  z.strictObject({ type: z.literal("finished"), passed: z.boolean() }),
  z.strictObject({ type: z.literal("error") }),
]);
