import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface SecretEncryption {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

/** One application-owned secret, protected by the OS through Electron safeStorage. */
export class EncryptedSecretStore {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly encryption: SecretEncryption,
  ) {}

  available(): boolean {
    return this.encryption.available();
  }

  async read(): Promise<string | undefined> {
    await this.pending;
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error("Couldn't read the saved connection.");
    }
    if (!this.available()) throw new Error("Secure credential storage is unavailable.");
    try {
      if (encrypted.length > 128 * 1024) throw new Error("Invalid credential file.");
      return this.encryption.decrypt(encrypted);
    } catch {
      throw new Error("Couldn't unlock the saved connection. Sign in again.");
    }
  }

  write(value: string | undefined): Promise<void> {
    const operation = this.pending.then(async () => {
      if (value === undefined) {
        await unlink(this.path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw new Error("Couldn't remove the saved connection.");
        });
        return;
      }
      if (!this.available()) throw new Error("Secure credential storage is unavailable.");
      try {
        const encrypted = this.encryption.encrypt(value);
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(`${this.path}.tmp`, encrypted, { mode: 0o600 });
        await rename(`${this.path}.tmp`, this.path);
      } catch {
        await unlink(`${this.path}.tmp`).catch(() => {});
        throw new Error("Couldn't save the connection securely. Please try again.");
      }
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
