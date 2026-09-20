import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { PetResizeEdge, PetResizeRequest } from "../../shared/contracts";

export function PetPanelResize({ onError }: { onError: (message: string) => void }) {
  const active = useRef<{ id: number; element: HTMLElement } | null>(null);
  const frame = useRef<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const reportError = useRef(onError);
  reportError.current = onError;

  function request(value: PetResizeRequest) {
    void window.computerCat.resizePetPanel(value).catch(() => {
      reportError.current("Couldn't resize the panel. Try again.");
    });
  }
  function stopFrame() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }
  function finish(phase: "end" | "cancel") {
    stopFrame();
    const gesture = active.current;
    if (!gesture) return;
    active.current = null;
    if (gesture.element.hasPointerCapture(gesture.id))
      gesture.element.releasePointerCapture(gesture.id);
    setResizing(false);
    request({ phase });
  }
  const cancel = useRef(() => finish("cancel"));
  cancel.current = () => finish("cancel");
  useEffect(() => {
    const blur = () => cancel.current();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel.current();
      }
    };
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", onEscape, true);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", onEscape, true);
      cancel.current();
    };
  }, []);
  function begin(event: PointerEvent<HTMLElement>, edge: PetResizeEdge) {
    if (event.button !== 0 || active.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { id: event.pointerId, element: event.currentTarget };
    setResizing(true);
    request({ phase: "start", edge });
  }
  const pointer = {
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (active.current?.id !== event.pointerId || frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (active.current) request({ phase: "move" });
      });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (active.current?.id === event.pointerId) finish("end");
    },
    onPointerCancel: () => finish("cancel"),
    onLostPointerCapture: () => finish("cancel"),
  };
  return (
    <div className="pet-panel-resize" data-resizing={resizing}>
      <div
        className="pet-resize-edge top"
        aria-hidden="true"
        onPointerDown={(event) => begin(event, "top")}
        {...pointer}
      />
      <div
        className="pet-resize-edge left"
        aria-hidden="true"
        onPointerDown={(event) => begin(event, "left")}
        {...pointer}
      />
      <button
        type="button"
        className="pet-panel-grip"
        aria-label="Resize conversation"
        title="Drag to resize · Arrow keys resize · Shift for larger steps"
        onPointerDown={(event) => begin(event, "top-left")}
        {...pointer}
        onKeyDown={(event) => {
          const { key } = event;
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;
          event.preventDefault();
          event.stopPropagation();
          const grow = key === "ArrowLeft" || key === "ArrowUp";
          const delta = event.shiftKey ? (grow ? 40 : -40) : grow ? 10 : -10;
          request({
            phase: "step",
            axis: key === "ArrowLeft" || key === "ArrowRight" ? "width" : "height",
            delta,
          });
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 9V2h7M5 7V5h2" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
