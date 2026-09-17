import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ActionResult } from "../shared/contracts";
import { type ModelSettings, modelSettingsSchema } from "../shared/models";

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
      if (parsed.success) this.value = parsed.data;
    } catch {
      // Missing/corrupt preferences cannot introduce a new connection.
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
