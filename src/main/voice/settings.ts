import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DEFAULT_VOICE,
  VoiceError,
  type VoiceSettings,
  voiceSettingsSchema,
} from "../../shared/voice";
export class VoiceSettingsStore {
  private value = { ...DEFAULT_VOICE };
  private pending: Promise<void> = Promise.resolve();
  notice = false;
  constructor(private readonly path: string) {}
  async load(): Promise<void> {
    try {
      this.value = voiceSettingsSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (e) {
      this.value = { ...DEFAULT_VOICE };
      this.notice = (e as NodeJS.ErrnoException).code !== "ENOENT";
    }
  }
  snapshot(): VoiceSettings {
    return { ...this.value };
  }
  update(value: unknown): Promise<void> {
    const parsed = voiceSettingsSchema.safeParse(value);
    if (!parsed.success) return Promise.reject(new VoiceError("protocol-error"));
    const task = this.pending.then(async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(`${this.path}.tmp`, JSON.stringify(parsed.data));
        await rename(`${this.path}.tmp`, this.path);
        this.value = parsed.data;
      } catch {
        throw new VoiceError("disk-full");
      }
    });
    this.pending = task.catch(() => {});
    return task;
  }
}
