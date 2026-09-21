import { describe, expect, it, vi } from "vitest";
import { connectForEvaluation } from "../../src/main/evaluation-connection";
import type { CodexConnection } from "../../src/shared/models";

function fixture(connected = false) {
  const state: CodexConnection = { connected, login: null, storageAvailable: true, message: null };
  const auth = {
    snapshot: () => state,
    start: vi.fn(() => {
      state.login = {
        attemptId: "fixture-attempt",
        method: "browser",
        canOpenBrowser: true,
        acceptsCode: false,
        userCode: null,
      };
      return { ok: true as const };
    }),
    cancel: vi.fn(() => {
      state.login = null;
      return { ok: true as const };
    }),
  };
  return { auth, state };
}
describe("evaluation sign-in recovery", () => {
  it("reuses an active app login without opening sign-in", async () => {
    const { auth } = fixture(true);
    const show = vi.fn();
    await connectForEvaluation(auth, new AbortController().signal, show);
    expect(show).not.toHaveBeenCalled();
    expect(auth.start).not.toHaveBeenCalled();
  });
  it("continues automatically after the app connects", async () => {
    const { auth, state } = fixture();
    const show = vi.fn();
    const pending = connectForEvaluation(auth, new AbortController().signal, show);
    state.connected = true;
    state.login = null;
    await pending;
    expect(show).toHaveBeenCalledOnce();
    expect(auth.start).toHaveBeenCalledWith("browser");
    expect(auth.cancel).not.toHaveBeenCalled();
  });
  it("cancels only a sign-in started by this evaluation", async () => {
    const first = fixture();
    const signal = new AbortController();
    const pending = connectForEvaluation(first.auth, signal.signal, () => {});
    signal.abort();
    await expect(pending).rejects.toThrow();
    expect(first.auth.cancel).toHaveBeenCalledWith("fixture-attempt");
    const second = fixture();
    second.auth.start();
    second.auth.start.mockClear();
    const otherSignal = new AbortController();
    const waiting = connectForEvaluation(second.auth, otherSignal.signal, () => {});
    otherSignal.abort();
    await expect(waiting).rejects.toThrow();
    expect(second.auth.start).not.toHaveBeenCalled();
    expect(second.auth.cancel).not.toHaveBeenCalled();
  });
});
