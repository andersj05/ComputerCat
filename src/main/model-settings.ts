import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ActionResult } from "../shared/contracts";
import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from "../shared/models";
import { modelSettingsSchema } from "../shared/validation";

export class ModelSettingsStore {
  private value: ModelSettings;
  private pending: Promise<ActionResult> = Promise.resolve({ ok: true });

  constructor(
    private readonly path: string,
    initial: ModelSettings,
  ) {
    this.value = { ...initial };
  }

  async load(): Promise<void> {
    try {
      const parsed = modelSettingsSchema.safeParse(JSON.parse(await readFile(this.path, "utf8")));
      this.value = parsed.success ? parsed.data : { ...DEFAULT_MODEL_SETTINGS };
    } catch (error) {
      // Only a first launch may inherit the explicit environment connection. Damaged
      // saved preferences must never silently switch subscription users to API billing.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        this.value = { ...DEFAULT_MODEL_SETTINGS };
    }
  }

  snapshot(): ModelSettings {
    return { ...this.value };
  }

  update(input: unknown): Promise<ActionResult> {
    const parsed = modelSettingsSchema.safeParse(input);
    if (!parsed.success)
      return Promise.resolve({ ok: false, message: "Choose valid model settings." });
    this.pending = this.pending.then(async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(`${this.path}.tmp`, JSON.stringify(parsed.data), "utf8");
        await rename(`${this.path}.tmp`, this.path);
        this.value = parsed.data;
        return { ok: true };
      } catch {
        return { ok: false, message: "Couldn't save your default model. Please try again." };
      }
    });
    return this.pending;
  }
}
