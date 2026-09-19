import type { ChatSnapshot } from "../../shared/contracts";
import type { VoiceSnapshot } from "../../shared/voice";

export const PET_ACTIVITIES = {
  idle: {
    label: "Idle",
    description: "A little breathing, a curious look, and the occasional wink.",
  },
  preparing: {
    label: "Getting ready…",
    description: "Straightening up before the microphone is ready.",
  },
  listening: {
    label: "Listening",
    description: "Leaning in with a listening ear. The microphone is on.",
  },
  transcribing: {
    label: "Transcribing…",
    description: "Taking little notes while your words become text.",
  },
  review: {
    label: "Review message",
    description: "Waiting patiently while you check your message.",
  },
  thinking: {
    label: "Thinking…",
    description: "A thoughtful tilt while figuring out the next step.",
  },
  working: { label: "Working…", description: "Busy paws at the keyboard while a tool is running." },
  replying: {
    label: "Replying…",
    description: "An animated talking face as the text reply arrives. No audio plays.",
  },
  happy: { label: "All done!", description: "A happy little flourish when a new reply finishes." },
  stopping: { label: "Stopping…", description: "Settling down while the microphone closes." },
  error: {
    label: "Needs attention",
    description: "A puzzled look when something needs your attention.",
  },
} as const;

export type PetActivity = keyof typeof PET_ACTIVITIES;

/** Presentation only: use authoritative activity, never infer capture from availability. */
export function getPetActivity({
  chat,
  voice,
  error = "",
  hasDraft = false,
}: {
  chat: ChatSnapshot;
  voice: VoiceSnapshot;
  error?: string;
  hasDraft?: boolean;
}): PetActivity {
  switch (voice.phase) {
    case "starting":
      return "preparing";
    case "recording":
      return "listening";
    case "finalizing":
    case "transcribing":
      return "transcribing";
    case "cancelling":
      return "stopping";
  }
  const latest = chat.messages.at(-1);
  const reply = latest?.role === "assistant" ? latest : undefined;
  if (chat.busy) {
    // A conversation switch can be busy with an old, completed reply still visible.
    if (reply?.state !== "streaming") return "thinking";
    if (reply.tools?.some((tool) => tool.state === "running")) return "working";
    return reply.text.trim() ? "replying" : "thinking";
  }
  if (error || chat.persistenceError || (voice.error && voice.error !== "cancelled"))
    return "error";
  if (voice.phase === "review" || hasDraft) return "review";
  if (reply?.state === "error") return "error";
  return "idle";
}

/** History restoration, cancellation and failed replies must never trigger a celebration. */
export function newlyCompletedReply(previous: ChatSnapshot, next: ChatSnapshot): string | null {
  if (!previous.busy || next.busy || previous.conversationId !== next.conversationId) return null;
  const before = previous.messages.at(-1);
  const after = next.messages.at(-1);
  return before?.role === "assistant" &&
    before.state === "streaming" &&
    after?.role === "assistant" &&
    after.id === before.id &&
    after.state === "complete" &&
    after.text.trim() &&
    !next.persistenceError
    ? after.id
    : null;
}
