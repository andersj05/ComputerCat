import type { Point, Rectangle } from "electron";
import type { PetResizeEdge } from "../shared/contracts";

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

export interface ResizeLimits {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

/** Resize toward the top/left, keeping the cat's bottom-right anchor in place. */
export function resizeFromAnchor(
  bounds: Rectangle,
  requested: { width: number; height: number },
  area: Rectangle,
  limits: ResizeLimits,
): Rectangle {
  const minWidth = Math.min(limits.minWidth, area.width);
  const minHeight = Math.min(limits.minHeight, area.height);
  const right = Math.min(area.x + area.width, Math.max(area.x + minWidth, bounds.x + bounds.width));
  const bottom = Math.min(
    area.y + area.height,
    Math.max(area.y + minHeight, bounds.y + bounds.height),
  );
  const width = Math.round(
    Math.max(minWidth, Math.min(requested.width, limits.maxWidth, right - area.x)),
  );
  const height = Math.round(
    Math.max(minHeight, Math.min(requested.height, limits.maxHeight, bottom - area.y)),
  );
  return { x: Math.round(right - width), y: Math.round(bottom - height), width, height };
}

export class PetResize {
  private gesture: {
    cursor: Point;
    bounds: Rectangle;
    edge: PetResizeEdge;
    area: Rectangle;
    limits: ResizeLimits;
    started: number;
  } | null = null;

  start(
    cursor: Point,
    bounds: Rectangle,
    edge: PetResizeEdge,
    area: Rectangle,
    limits: ResizeLimits,
  ): void {
    this.gesture = { cursor, bounds, edge, area, limits, started: Date.now() };
  }

  move(cursor: Point): Rectangle | null {
    const gesture = this.gesture;
    if (!gesture) return null;
    if (Date.now() - gesture.started > 30_000) {
      this.cancel();
      return null;
    }
    const { bounds, edge, area, limits } = gesture;
    return resizeFromAnchor(
      bounds,
      {
        width: bounds.width - (edge === "top" ? 0 : cursor.x - gesture.cursor.x),
        height: bounds.height - (edge === "left" ? 0 : cursor.y - gesture.cursor.y),
      },
      area,
      limits,
    );
  }

  cancel(): void {
    this.gesture = null;
  }
}
