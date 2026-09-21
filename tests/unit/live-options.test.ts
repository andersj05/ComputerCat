import { describe, expect, it } from "vitest";
import { liveOptions } from "../../evals/live-options.ts";

describe("live evaluation launch options", () => {
  it("starts a small uniquely named run without requiring flags", () => {
    const first = liveOptions([]);
    expect(first.repeats).toBe(1);
    expect(first.run).toMatch(/^luna-[0-9]+-[a-f0-9]{8}$/);
    expect(liveOptions([]).run).not.toBe(first.run);
    expect(first.help).toBeUndefined();
  });
  it("validates run paths and limits before accessing credentials", () => {
    for (const args of [
      ["--run", "../outside"],
      ["--repeats", "4"],
      ["--repeats", "0"],
      ["--user-data", "relative"],
    ])
      expect(() => liveOptions(args)).toThrow();
    expect(liveOptions(["--run", "baseline", "--repeats", "3"]).repeats).toBe(3);
    expect(liveOptions(["--check"]).check).toBe(true);
  });
});
