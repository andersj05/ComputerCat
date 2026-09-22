import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, test as base, type ElectronApplication, type Page } from "@playwright/test";
import type { DesktopSource } from "../../src/main/desktop/controller";
import type { ComputerSnapshot } from "../../src/shared/computer-use";
import { ownedInput } from "./owned-input";
import { ownedWindow } from "./owned-window";

export function findControl(state: ComputerSnapshot, name: string) {
  const element = state.elements.find((item) => item.name === name);
  if (!element) throw new Error(`Missing fixture control ${name}`);
  return element;
}

export const test = base.extend<{
  input: ReturnType<typeof ownedInput>;
  native: Awaited<ReturnType<typeof ownedWindow>> & { source: DesktopSource };
  ownedBrowser: { app: ElectronApplication; page: Page; source: DesktopSource };
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture dependency destructuring.
  input: async ({}, use, info) => {
    const input = ownedInput();
    try {
      await use(input);
    } finally {
      await info.attach("computer-use-measurements", {
        body: JSON.stringify(input.measurements),
        contentType: "application/json",
      });
    }
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture dependency destructuring.
  native: async ({}, use) => {
    base.skip(process.platform !== "win32", "Windows input requires Windows");
    const fixture = await ownedWindow("tests/fixtures/computer-input.ps1");
    try {
      await use({
        ...fixture,
        source: {
          id: `window:${fixture.handle}:0`,
          name: "Computer Cat input fixture",
          kind: "window",
        },
      });
    } finally {
      await fixture.close();
    }
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture dependency destructuring.
  ownedBrowser: async ({}, use) => {
    base.skip(process.platform !== "win32", "Windows accessibility test");
    const userData = await mkdtemp(join(tmpdir(), "computercat-browser-input-"));
    const cleanup = async () => {
      if (!userData.startsWith(join(tmpdir(), "computercat-browser-input-")))
        throw new Error("Invalid test directory");
      await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    };
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    let app: ElectronApplication | undefined;
    try {
      app = await _electron.launch({
        args: [resolve("tests/fixtures/browser-editor.mjs"), `--user-data-dir=${userData}`],
        env,
      });
      const page = await app.firstWindow();
      await page.getByRole("heading", { name: "Draft for Robin" }).waitFor();
      const id = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) throw new Error("Missing owned window");
        // Native inspection, not Playwright's focus emulation, determines foreground ownership.
        window.show();
        window.focus();
        return window.getMediaSourceId();
      });
      await use({ app, page, source: { id, name: "Owned browser email fixture", kind: "window" } });
    } finally {
      try {
        await app?.close();
      } finally {
        await cleanup();
      }
    }
  },
});
