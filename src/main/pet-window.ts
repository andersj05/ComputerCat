import type { Point, Rectangle } from "electron";

export function keepInWorkArea(bounds: Rectangle, area: Rectangle): Rectangle {
  return {
    ...bounds,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))),
  };
}

/** A click becomes a drag only after a deliberate movement in desktop DIP coordinates. */
export class PetDrag {
  private gesture: { cursor: Point; bounds: Rectangle; moved: boolean; started: number } | null =
    null;

  start(cursor: Point, bounds: Rectangle): void {
    this.gesture = { cursor, bounds, moved: false, started: Date.now() };
  }

  move(cursor: Point): Rectangle | null {
    const gesture = this.gesture;
    if (!gesture) return null;
    if (Date.now() - gesture.started > 30_000) {
      this.cancel();
      return null;
    }
    const dx = cursor.x - gesture.cursor.x;
    const dy = cursor.y - gesture.cursor.y;
    if (Math.hypot(dx, dy) >= 5) gesture.moved = true;
    if (!gesture.moved) return null;
    return { ...gesture.bounds, x: gesture.bounds.x + dx, y: gesture.bounds.y + dy };
  }

  end(): boolean {
    // Missing/expired gestures must never accidentally open chat.
    const moved = this.gesture?.moved ?? true;
    this.cancel();
    return moved;
  }

  cancel(): void {
    this.gesture = null;
  }
}
