import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptedSecretStore, type SecretEncryption } from "../../src/main/secret-store";

describe("encrypted credential persistence", () => {
  let directory: string;
  let path: string;
  let encryption: SecretEncryption;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "computercat-vault-"));
    path = join(directory, "codex.enc");
    const key = randomBytes(32);
    encryption = {
      available: () => true,
      encrypt: (text) => {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), data]);
      },
      decrypt: (data) => {
        const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
        decipher.setAuthTag(data.subarray(12, 28));
        return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString(
          "utf8",
        );
      },
    };
  });
  afterEach(async () => {
    if (directory.startsWith(join(tmpdir(), "computercat-vault-")))
      await rm(directory, { recursive: true, force: true });
  });
  it("writes only ciphertext, restores it, and deletes it on disconnect", async () => {
    const store = new EncryptedSecretStore(path, encryption);
    expect(await store.read()).toBeUndefined();
    await store.write("test-refresh-secret");
    expect((await readFile(path)).includes(Buffer.from("test-refresh-secret"))).toBe(false);
    expect(await new EncryptedSecretStore(path, encryption).read()).toBe("test-refresh-secret");
    await store.write(undefined);
    expect(await store.read()).toBeUndefined();
  });
  it("fails closed when encryption is unavailable or ciphertext is corrupt", async () => {
    const blocked = new EncryptedSecretStore(path, { ...encryption, available: () => false });
    await expect(blocked.write("secret")).rejects.toThrow("unavailable");
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(path, "corrupt");
    await expect(new EncryptedSecretStore(path, encryption).read()).rejects.toThrow(
      "Sign in again",
    );
  });
  it("preserves the saved credential after a failed replacement and allows retry", async () => {
    const store = new EncryptedSecretStore(path, encryption);
    await store.write("old-secret");
    await mkdir(`${path}.tmp`);
    await expect(store.write("new-secret")).rejects.toThrow("securely");
    expect(await store.read()).toBe("old-secret");
    await rm(`${path}.tmp`, { recursive: true });
    await store.write("new-secret");
    expect(await store.read()).toBe("new-secret");
  });
});
