import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { WindowsInput } from "../../src/main/desktop/windows-input";
import type { ComputerSnapshot } from "../../src/shared/computer-use";

test("native accessibility fills browser editors and verifies DOM without submitting", async () => {
  test.skip(process.platform !== "win32", "Windows accessibility test");
  test.setTimeout(90_000);
  const userData = await mkdtemp(join(tmpdir(), "computercat-browser-input-"));
  async function cleanup() {
    if (!userData.startsWith(join(tmpdir(), "computercat-browser-input-")))
      throw new Error("Invalid test directory");
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    args: [resolve("tests/fixtures/browser-editor.mjs"), `--user-data-dir=${userData}`],
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("heading")).toHaveText("Draft for Robin");
    await expect
      .poll(() => app.evaluate(() => Reflect.get(globalThis, "ownedEditorSource")))
      .toBeTruthy();
    const id = await app.evaluate(() => Reflect.get(globalThis, "ownedEditorSource") as string);
    const source = { id, name: "Owned browser email fixture", kind: "window" as const };
    const input = new WindowsInput();
    const signal = new AbortController().signal;
    const find = (state: ComputerSnapshot, name: string) => {
      const control = state.elements.find((element) => element.name === name);
      if (!control)
        throw new Error(`Missing owned browser control ${name}: ${JSON.stringify(state)}`);
      return control;
    };
    let state = await input.inspect(source, signal);
    expect(JSON.stringify(state)).not.toContain("never-expose-browser-secret");
    for (const [name, selector, text] of [
      ["Subject", "#subject", "Friday design review"],
      ["Message body", "#body", "Hi Robin,\nCan we review the design on Friday? Café 🐈"],
      ["Rich message", "#rich", "A draft in a rich editor."],
    ] as const) {
      const control = find(state, name);
      expect(control.actions).toContain("fill");
      const result = await input.act(
        state,
        control,
        { kind: "fill", elementId: "e1", text },
        signal,
      );
      expect(result.status).toBe("dispatched");
      if (selector === "#rich") await expect(page.locator(selector)).toHaveText(text);
      else await expect(page.locator(selector)).toHaveValue(text);
      expect(result.snapshot).toBeDefined();
      state = result.snapshot as ComputerSnapshot;
    }
    expect(
      await input.act(state, find(state, "Save draft"), { kind: "click", elementId: "e1" }, signal),
    ).toMatchObject({ status: "dispatched" });
    await expect(page.locator("#status")).toHaveText("Saved, unsent");
    await expect(page.locator("#recipient")).toHaveValue("robin@example.com");
  } finally {
    await app.close();
    await cleanup();
  }
});
