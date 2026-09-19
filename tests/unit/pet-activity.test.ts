import { describe, expect, it } from "vitest";
import { getPetActivity, newlyCompletedReply } from "../../src/renderer/src/pet-activity";
import type { ChatSnapshot } from "../../src/shared/contracts";
import type { VoiceSnapshot } from "../../src/shared/voice";

const idle: ChatSnapshot = { conversationId: "one", busy: false, messages: [] };
const voice: VoiceSnapshot = { revision: 0, phase: "idle", availability: "ready", elapsedMs: 0 };
const thinking: ChatSnapshot = {
  ...idle,
  busy: true,
  messages: [{ id: "reply", role: "assistant", state: "streaming", text: "" }],
};
const replying: ChatSnapshot = {
  ...thinking,
  messages: [{ id: "reply", role: "assistant", state: "streaming", text: "Hello!" }],
};
const complete: ChatSnapshot = {
  ...idle,
  messages: [{ id: "reply", role: "assistant", state: "complete", text: "Hello!" }],
};

describe("cat activity", () => {
  it.each([
    ["starting", "preparing"],
    ["recording", "listening"],
    ["finalizing", "transcribing"],
    ["transcribing", "transcribing"],
    ["cancelling", "stopping"],
    ["review", "review"],
  ] as const)("represents %s without parsing display text", (phase, expected) => {
    expect(getPetActivity({ chat: idle, voice: { ...voice, phase } })).toBe(expected);
  });

  it("keeps microphone activity visible over stale errors and chat output", () => {
    expect(
      getPetActivity({
        chat: replying,
        voice: { ...voice, phase: "recording" },
        error: "Old error",
      }),
    ).toBe("listening");
    expect(getPetActivity({ chat: idle, voice: { ...voice, availability: "preparing" } })).toBe(
      "idle",
    );
  });

  it("distinguishes reasoning, running tools and streamed words", () => {
    expect(getPetActivity({ chat: thinking, voice })).toBe("thinking");
    expect(getPetActivity({ chat: replying, voice })).toBe("replying");
    for (const state of ["running", "complete", "error", "stopped"] as const) {
      const chat: ChatSnapshot = {
        ...replying,
        messages: replying.messages.map((message) => ({
          ...message,
          tools: [{ id: "tool", name: "read", state }],
        })),
      };
      expect(getPetActivity({ chat, voice })).toBe(state === "running" ? "working" : "replying");
    }
  });

  it("does not speak historical text during a conversation switch", () => {
    expect(getPetActivity({ chat: { ...complete, busy: true }, voice })).toBe("thinking");
    expect(getPetActivity({ chat: complete, voice })).toBe("idle");
  });

  it("keeps review and recoverable errors distinct from normal cancellation", () => {
    expect(getPetActivity({ chat: idle, voice, hasDraft: true })).toBe("review");
    expect(getPetActivity({ chat: idle, voice, error: "Couldn't open chat" })).toBe("error");
    expect(getPetActivity({ chat: idle, voice: { ...voice, error: "device-missing" } })).toBe(
      "error",
    );
    expect(getPetActivity({ chat: idle, voice: { ...voice, error: "cancelled" } })).toBe("idle");
    expect(getPetActivity({ chat: { ...idle, persistenceError: "Save failed" }, voice })).toBe(
      "error",
    );
  });

  it("celebrates only a newly completed reply in the same conversation", () => {
    expect(newlyCompletedReply(replying, complete)).toBe("reply");
    expect(newlyCompletedReply(idle, complete)).toBeNull();
    expect(newlyCompletedReply(complete, complete)).toBeNull();
    expect(newlyCompletedReply(replying, { ...complete, conversationId: "two" })).toBeNull();
    expect(
      newlyCompletedReply(replying, { ...complete, persistenceError: "Save failed" }),
    ).toBeNull();
    for (const state of ["error", "stopped", "streaming"] as const) {
      expect(
        newlyCompletedReply(replying, {
          ...complete,
          messages: complete.messages.map((message) => ({ ...message, state })),
        }),
      ).toBeNull();
    }
    expect(newlyCompletedReply(replying, { ...complete, messages: [] })).toBeNull();
  });
});
