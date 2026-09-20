import { afterEach, describe, expect, it, vi } from "vitest";
import { keepInWorkArea, PetDrag, PetResize, resizeFromAnchor } from "../../src/main/pet-window";
import { petResizeSchema } from "../../src/shared/validation";

const bounds = { x: 100, y: 100, width: 188, height: 298 };
describe("desktop cat movement", () => {
  afterEach(() => vi.useRealTimers());

  it("distinguishes clicks from drags, including returning to the starting point", () => {
    const drag = new PetDrag();
    drag.start({ x: 120, y: 140 }, bounds);
    expect(drag.move({ x: 122, y: 142 })).toBeNull();
    expect(drag.end()).toBe(false);
    drag.start({ x: 120, y: 140 }, bounds);
    expect(drag.move({ x: 80, y: 200 })).toEqual({ ...bounds, x: 60, y: 160 });
    expect(drag.move({ x: 120, y: 140 })).toEqual(bounds);
    expect(drag.end()).toBe(true);
    expect(drag.move({ x: 500, y: 600 })).toBeNull();
  });

  it("cancels interrupted and expired gestures without turning them into clicks", () => {
    vi.useFakeTimers();
    const drag = new PetDrag();
    drag.start({ x: 120, y: 140 }, bounds);
    drag.cancel();
    expect(drag.end()).toBe(true);
    drag.start({ x: 120, y: 140 }, bounds);
    vi.advanceTimersByTime(30_001);
    expect(drag.move({ x: 500, y: 600 })).toBeNull();
    expect(drag.end()).toBe(true);
  });

  it("keeps every edge reachable on displays with negative and fractional coordinates", () => {
    const area = { x: -1920, y: -200, width: 1920, height: 1040 };
    expect(keepInWorkArea({ ...bounds, x: -3000, y: -500 }, area)).toEqual({
      ...bounds,
      x: -1920,
      y: -200,
    });
    expect(keepInWorkArea({ ...bounds, x: 100, y: 1000 }, area)).toEqual({
      ...bounds,
      x: -188,
      y: 542,
    });
    expect(keepInWorkArea({ ...bounds, x: -480.3, y: 100.7 }, area)).toEqual({
      ...bounds,
      x: -480,
      y: 101,
    });
  });
});

describe("cat panel resizing", () => {
  const panel = { x: -700, y: 200, width: 400, height: 638 };
  const area = { x: -1920, y: -100, width: 1920, height: 1080 };
  const limits = { minWidth: 360, minHeight: 538, maxWidth: 1200, maxHeight: 1098 };
  afterEach(() => vi.useRealTimers());

  it("keeps the cat anchor fixed and resizes only the grabbed edges", () => {
    const resize = new PetResize();
    for (const edge of ["top-left", "left", "top"] as const) {
      resize.start({ x: -690, y: 210 }, panel, edge, area, limits);
      const next = resize.move({ x: -790, y: 160 });
      expect(next).toEqual({
        x: edge === "top" ? -700 : -800,
        y: edge === "left" ? 200 : 150,
        width: edge === "top" ? 400 : 500,
        height: edge === "left" ? 638 : 688,
      });
      expect((next?.x ?? 0) + (next?.width ?? 0)).toBe(-300);
      expect((next?.y ?? 0) + (next?.height ?? 0)).toBe(838);
    }
  });

  it("bounds extreme sizes to usable minimums, the display and app limits", () => {
    const small = resizeFromAnchor(panel, { width: -1000, height: -1000 }, area, limits);
    expect(small).toEqual({ x: -660, y: 300, width: 360, height: 538 });
    const large = resizeFromAnchor(panel, { width: 10000, height: 10000 }, area, limits);
    expect(large).toEqual({ x: -1500, y: -100, width: 1200, height: 938 });
    const tinyArea = { x: -200, y: 10, width: 280, height: 400 };
    expect(resizeFromAnchor(panel, { width: 10000, height: 10000 }, tinyArea, limits)).toEqual(
      tinyArea,
    );
  });

  it("ignores late movement after cancellation or the gesture deadline", () => {
    vi.useFakeTimers();
    const resize = new PetResize();
    expect(resize.move({ x: 0, y: 0 })).toBeNull();
    resize.start({ x: 0, y: 0 }, panel, "top-left", area, limits);
    resize.cancel();
    expect(resize.move({ x: -100, y: -100 })).toBeNull();
    resize.start({ x: 0, y: 0 }, panel, "top-left", area, limits);
    vi.advanceTimersByTime(30_001);
    expect(resize.move({ x: -100, y: -100 })).toBeNull();
  });

  it("accepts only named resize gestures and bounded keyboard steps", () => {
    for (const request of [
      { phase: "start", edge: "top-left" },
      { phase: "move" },
      { phase: "end" },
      { phase: "cancel" },
      { phase: "step", axis: "width", delta: -10 },
    ])
      expect(petResizeSchema.safeParse(request).success).toBe(true);
    for (const request of [
      null,
      "start",
      { phase: "start" },
      { phase: "start", edge: "bottom" },
      { phase: "move", x: 1, y: 2 },
      { phase: "step", axis: "x", delta: 10 },
      { phase: "step", axis: "width", delta: 100000 },
      { phase: "step", axis: "height", delta: Number.NaN },
    ])
      expect(petResizeSchema.safeParse(request).success).toBe(false);
  });
});
