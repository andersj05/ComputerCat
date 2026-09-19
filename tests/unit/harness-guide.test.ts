import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarnessGuide } from "../../src/main/harness-guide";

describe("bundled harness guide export", () => {
  let directory: string;
  let bundle: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "computercat-guide-"));
    bundle = join(directory, "bundled.html");
    await writeFile(bundle, "<!doctype html><title>Packaged guide</title>");
  });
  afterEach(async () => {
    if (!directory.startsWith(join(tmpdir(), "computercat-guide-")))
      throw new Error("Unexpected fixture directory");
    await rm(directory, { recursive: true, force: true });
  });

  it("exports the complete bundled file for an ordinary browser and refreshes it on upgrade", async () => {
    const open = vi.fn(async () => "");
    const guide = new HarnessGuide(bundle, directory, open);
    const target = join(directory, "help", "harness-guide.html");
    expect(await guide.open()).toEqual({ ok: true });
    expect(open).toHaveBeenCalledWith(target);
    expect(await readFile(target, "utf8")).toBe(await readFile(bundle, "utf8"));
    await writeFile(bundle, "<!doctype html><title>Updated guide</title>");
    expect(await guide.open()).toEqual({ ok: true });
    expect(await readFile(target, "utf8")).toContain("Updated guide");
  });

  it("coalesces repeated opens until the browser launch settles", async () => {
    let finish: (result: string) => void = () => {};
    const open = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const guide = new HarnessGuide(bundle, directory, open);
    const first = guide.open();
    expect(guide.open()).toBe(first);
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    finish("");
    expect(await first).toEqual({ ok: true });
  });

  it("sanitizes shell failures and permits retry", async () => {
    const open = vi
      .fn()
      .mockResolvedValueOnce("Private OS path error")
      .mockRejectedValueOnce(new Error("Private launch error"))
      .mockResolvedValue("");
    const guide = new HarnessGuide(bundle, directory, open);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await guide.open();
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).not.toContain("Private");
    }
    expect(await guide.open()).toEqual({ ok: true });
  });

  it("does not open a browser when the bundle cannot be read or exported", async () => {
    const open = vi.fn(async () => "");
    const missing = new HarnessGuide(join(directory, "missing.html"), directory, open);
    expect(await missing.open()).toMatchObject({ ok: false });
    const blocked = new HarnessGuide(bundle, bundle, open);
    expect(await blocked.open()).toMatchObject({ ok: false });
    expect(open).not.toHaveBeenCalled();
  });
});
