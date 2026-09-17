import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type ActionResult, DEFAULT_PREFERENCES, type PetPreferences } from "../shared/contracts";
import { petPreferencesSchema, preferencesPatchSchema } from "../shared/validation";

export class PreferencesStore {
  private value: PetPreferences = { ...DEFAULT_PREFERENCES };
  private pending: Promise<ActionResult> = Promise.resolve({ ok: true });

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    try {
      const parsed = petPreferencesSchema.safeParse(JSON.parse(await readFile(this.path, "utf8")));
      if (parsed.success) this.value = parsed.data;
    } catch {
      // First launch or an unreadable preference file uses the safe defaults.
    }
  }

  snapshot(): PetPreferences {
    return { ...this.value };
  }

  update(input: unknown): Promise<ActionResult> {
    const parsed = preferencesPatchSchema.safeParse(input);
    if (!parsed.success)
      return Promise.resolve({ ok: false, message: "Choose a valid cat setting." });
    // Serialize writes so rapid requests cannot overwrite each other's settings.
    this.pending = this.pending.then(async () => {
      const patch = Object.fromEntries(
        Object.entries(parsed.data).filter(([, value]) => value !== undefined),
      );
      const next = { ...this.value, ...patch };
      try {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(`${this.path}.tmp`, JSON.stringify(next), "utf8");
        await rename(`${this.path}.tmp`, this.path);
        this.value = next;
        return { ok: true };
      } catch {
        return { ok: false, message: "Couldn't save that setting. Please try again." };
      }
    });
    return this.pending;
  }
}
