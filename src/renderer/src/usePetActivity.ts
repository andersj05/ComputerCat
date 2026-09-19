import { useEffect, useRef, useState } from "react";
import type { ChatSnapshot } from "../../shared/contracts";
import type { VoiceSnapshot } from "../../shared/voice";
import { getPetActivity, newlyCompletedReply } from "./pet-activity";

export function usePetActivity(
  chat: ChatSnapshot,
  voice: VoiceSnapshot,
  error: string,
  hasDraft: boolean,
) {
  const previous = useRef(chat);
  const [celebration, setCelebration] = useState<{
    conversationId: string | undefined;
    replyId: string;
  } | null>(null);
  const activity = getPetActivity({ chat, voice, error, hasDraft });

  useEffect(() => {
    const changedConversation = previous.current.conversationId !== chat.conversationId;
    const replyId = newlyCompletedReply(previous.current, chat);
    previous.current = chat;
    if (replyId) setCelebration({ conversationId: chat.conversationId, replyId });
    else if (changedConversation || chat.busy || activity !== "idle") setCelebration(null);
  }, [chat, activity]);

  useEffect(() => {
    if (!celebration) return;
    const timeout = window.setTimeout(() => setCelebration(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [celebration]);

  return activity === "idle" &&
    celebration !== null &&
    celebration?.conversationId === chat.conversationId &&
    celebration?.replyId === chat.messages.at(-1)?.id
    ? "happy"
    : activity;
}
