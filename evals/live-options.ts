import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { assertRunId } from "./storage.ts";

export const LIVE_HELP = `Computer Cat live evaluations: Luna / Medium, controlled tool fixtures.
npm run eval:live                              Four tasks, one attempt each; automatic run name
npm run eval:live -- --check                    Check sign-in without a model call
npm run eval:live -- --run luna-baseline --repeats 3
npm run eval:live -- --tasks all --repeats 3     Twelve tasks, three attempts each
Use --tasks comma-separated-IDs and --repeats 1-3. Quit Computer Cat before a model run.
Reports and synthetic traces are stored in .local/evals/RUN. See docs/live-evaluations.md.`;

export function liveOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      run: { type: "string" },
      tasks: { type: "string" },
      repeats: { type: "string", default: "1" },
      check: { type: "boolean" },
      help: { type: "boolean" },
      "user-data": { type: "string" },
    },
    allowPositionals: false,
  });
  const repeats = Number(values.repeats);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3)
    throw new Error("Use --repeats 1, 2 or 3.");
  const run =
    values.run ?? `luna-${new Date().toISOString().replace(/\D/g, "")}-${randomUUID().slice(0, 8)}`;
  assertRunId(run);
  if (values["user-data"] && !isAbsolute(values["user-data"]))
    throw new Error("--user-data must be the absolute path of a Computer Cat profile.");
  return { ...values, repeats, run };
}
