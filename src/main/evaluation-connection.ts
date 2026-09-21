import { setTimeout as delay } from "node:timers/promises";
import type { CodexAuth } from "../agent/codex-auth";

/** Reuse a current login; only a missing connection needs the app's normal browser flow. */
export async function connectForEvaluation(
  auth: Pick<CodexAuth, "snapshot" | "start" | "cancel">,
  signal: AbortSignal,
  showModels: () => void,
) {
  if (auth.snapshot().connected) return;
  signal.throwIfAborted();
  showModels();
  let ownAttempt: string | undefined;
  if (!auth.snapshot().login) {
    const result = auth.start("browser");
    if (!result.ok) throw new Error("Computer Cat could not start sign-in.");
    ownAttempt = auth.snapshot().login?.attemptId;
  }
  try {
    const deadline = Date.now() + 15 * 60_000;
    while (!auth.snapshot().connected) {
      signal.throwIfAborted();
      if (!auth.snapshot().login || Date.now() >= deadline)
        throw new Error("Computer Cat sign-in did not complete.");
      await delay(250, undefined, { signal });
    }
  } finally {
    if (ownAttempt && auth.snapshot().login?.attemptId === ownAttempt) auth.cancel(ownAttempt);
  }
}
