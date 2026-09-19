import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ActionResult } from "../shared/contracts";

export class HarnessGuide {
  private pending: Promise<ActionResult> | undefined;

  constructor(
    private readonly bundledFile: string,
    private readonly userData: string,
    private readonly openPath: (path: string) => Promise<string>,
  ) {}

  open(): Promise<ActionResult> {
    if (this.pending) return this.pending;
    this.pending = this.openBundledGuide().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async openBundledGuide(): Promise<ActionResult> {
    try {
      // Browsers cannot read app.asar. Export only this self-contained, bundled document.
      const directory = join(this.userData, "help");
      const target = join(directory, "harness-guide.html");
      await mkdir(directory, { recursive: true });
      await copyFile(this.bundledFile, target);
      if (await this.openPath(target)) throw new Error("Open failed");
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: "Couldn't open the harness guide. Check your default browser and try again.",
      };
    }
  }
}
