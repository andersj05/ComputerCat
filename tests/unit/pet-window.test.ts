import { afterEach, describe, expect, it, vi } from "vitest";
import { keepInWorkArea, PetDrag } from "../../src/main/pet-window";

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
