// Only these application-authored messages may cross the desktop broker boundary.
export class CaptureError extends Error {
  constructor(readonly code: "unavailable" | "timeout" | "cancelled" | "busy" | "already-failed") {
    super(
      {
        unavailable:
          "The selected source could not provide a frame. It may be minimized, closed, or capture-protected. Use readable text or choose another source.",
        timeout:
          "The selected source did not provide a frame in time. Use readable text or choose another source.",
        cancelled: "Screen capture was cancelled.",
        busy: "Another screen capture is still stopping. Wait for it to finish.",
        "already-failed":
          "Capture already failed for this source during this reply. Use text/selection/tab tools or a different source. A new user message permits a fresh capture attempt.",
      }[code],
    );
  }
}
