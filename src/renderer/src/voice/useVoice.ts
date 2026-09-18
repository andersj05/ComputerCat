import { useEffect, useRef, useState } from "react";
import type { VoiceSnapshot } from "../../../shared/voice";
import { VoiceCapture } from "./capture";
export function useVoice(
  isPet: boolean,
  draft: {
    conversationId: string | undefined;
    text: string;
    revision: number;
    insert: (text: string) => void;
  },
) {
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>({
    revision: -1,
    phase: "idle",
    availability: "disabled",
    elapsedMs: 0,
  });
  const [reviews, setReviews] = useState<Record<string, string>>({});
  const current = useRef(draft);
  current.current = draft;
  const revision = useRef(-1);
  const owner = useRef<{ id: string; capture: VoiceCapture } | undefined>(undefined);
  const beginnings = useRef(new Map<string, number>());
  const consumed = useRef(new Set<string>());
  const acknowledgments = useRef(new Set<string>());
  useEffect(() => {
    for (const sessionId of acknowledgments.current) {
      acknowledgments.current.delete(sessionId);
      void window.computerCat.voiceResultConsumed({ sessionId });
    }
  });
  useEffect(() => {
    let alive = true;
    const update = (value: VoiceSnapshot) => {
      if (!alive || value.revision < revision.current) return;
      revision.current = value.revision;
      setSnapshot(value);
      if (
        (value.owner === "pet") === isPet &&
        value.transcript &&
        value.sessionId &&
        value.conversationId &&
        !consumed.current.has(value.sessionId)
      ) {
        consumed.current.add(value.sessionId);
        const d = current.current;
        const combined = d.text ? `${d.text.trimEnd()} ${value.transcript}` : value.transcript;
        if (
          d.conversationId === value.conversationId &&
          beginnings.current.get(value.sessionId) === d.revision &&
          combined.length <= 6000
        )
          d.insert(combined);
        else
          setReviews((previous) => ({
            ...previous,
            [value.conversationId as string]: previous[value.conversationId as string]
              ? `${previous[value.conversationId as string]}\n${value.transcript}`
              : (value.transcript as string),
          }));
        acknowledgments.current.add(value.sessionId);
      }
    };
    const off = window.computerCat.onVoiceChanged(update);
    const offStart = window.computerCat.onVoiceCaptureRequested((request) => {
      if (owner.current?.id === request.sessionId) return;
      void owner.current?.capture.stop(false);
      beginnings.current.set(request.sessionId, current.current.revision);
      const capture = new VoiceCapture(request, window.computerCat);
      owner.current = { id: request.sessionId, capture };
      capture.start();
    });
    const offStop = window.computerCat.onVoiceCaptureStopped((request) => {
      if (owner.current?.id === request.sessionId)
        void owner.current.capture.stop(request.reason === "finish");
    });
    void window.computerCat.voiceSnapshot().then(update);
    const unload = () => {
      void owner.current?.capture.stop(false);
    };
    window.addEventListener("pagehide", unload);
    return () => {
      alive = false;
      off();
      offStart();
      offStop();
      window.removeEventListener("pagehide", unload);
      void owner.current?.capture.stop(false);
      owner.current = undefined;
    };
  }, [isPet]);
  const busy = !["idle", "review"].includes(snapshot.phase);
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busy && snapshot.sessionId)
        void window.computerCat.voiceCancel({ sessionId: snapshot.sessionId });
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [busy, snapshot.sessionId]);
  const key = draft.conversationId ?? "";
  return {
    snapshot,
    busy,
    review: reviews[key] ?? "",
    setReview: (text: string) => setReviews((previous) => ({ ...previous, [key]: text })),
    dropReview: (id: string) =>
      setReviews((previous) => {
        const copy = { ...previous };
        delete copy[id];
        return copy;
      }),
  };
}
