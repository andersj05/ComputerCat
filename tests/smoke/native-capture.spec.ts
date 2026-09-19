import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect, test } from "@playwright/test";

async function cleanup(path: string) {
  if (!path.startsWith(join(tmpdir(), "computercat-capture-")))
    throw new Error("Unexpected fixture path");
  await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

test("captures pixels from one owned window without thumbnail enumeration and stops its media helper", async () => {
  test.skip(process.platform !== "win32", "Native Windows capture fixture");
  const userData = await mkdtemp(join(tmpdir(), "computercat-capture-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = (directory: string) =>
    _electron.launch({
      args: [
        resolve("tests/fixtures/native-capture.mjs"),
        resolve("out/main/desktop-capture.js"),
        resolve("out/renderer/desktop-capture.html"),
        `--user-data-dir=${directory}`,
      ],
      env,
    });
  const electron = await launch(join(userData, "observer"));
  let target: ElectronApplication | undefined;
  try {
    target = await launch(join(userData, "target"));
    const targetApp = target;
    await expect
      .poll(() => targetApp.evaluate(() => typeof Reflect.get(globalThis, "captureSourceFixture")))
      .toBe("function");
    const sourceId = await target.evaluate(() => Reflect.get(globalThis, "captureSourceFixture")());
    await expect
      .poll(() => electron.evaluate(() => typeof Reflect.get(globalThis, "captureFixture")))
      .toBe("function");
    await electron.evaluate(({ desktopCapturer }) => {
      desktopCapturer.getSources = async () => {
        throw new Error("Native capture must not enumerate thumbnails or other windows");
      };
    });
    const result = await electron.evaluate(
      (_, id) => Reflect.get(globalThis, "captureFixture")(undefined, id),
      sourceId,
    );
    expect(result.width).toBeGreaterThan(100);
    expect(result.height).toBeGreaterThan(100);
    // Native video conversion may shift a channel slightly (RGB -> YUV -> RGB).
    for (const [actual, expected] of [
      [result.left, [16, 32, 240]],
      [result.right, [224, 64, 16]],
    ])
      for (let channel = 0; channel < 3; channel++)
        expect(Math.abs(actual[channel] - (expected[channel] ?? 0))).toBeLessThanOrEqual(3);
    expect(result.windows).toBe(1);
    const crop = await electron.evaluate(
      (_, id) =>
        Reflect.get(globalThis, "captureFixture")({ x: 0.5, y: 0, width: 0.5, height: 1 }, id),
      sourceId,
    );
    expect(crop.width).toBe(Math.ceil(result.width / 2));
    expect(crop.height).toBe(result.height);
    for (const point of [crop.left, crop.right])
      for (let channel = 0; channel < 3; channel++)
        expect(Math.abs(point[channel] - ([224, 64, 16][channel] ?? 0))).toBeLessThanOrEqual(3);
    expect(crop.windows).toBe(1);
    expect(await electron.evaluate(() => Reflect.get(globalThis, "captureCancelFixture")())).toBe(
      "cancelled",
    );
    expect(
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    ).toBe(1);
  } finally {
    await target?.close();
    await electron.close();
    await cleanup(userData);
  }
});
