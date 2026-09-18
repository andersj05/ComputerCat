import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import catalogue from "../../../resources/voice/models.json";
import { VoiceError } from "../../shared/voice";

export const speechAssets = catalogue.assets;
export type Asset = (typeof speechAssets)[number];
export type DownloadClient = (
  url: string,
  signal: AbortSignal,
) => Promise<AsyncIterable<Uint8Array>>;
export const downloadAsset: DownloadClient = async (url, signal) => {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !catalogue.redirectHosts.includes(parsed.hostname)
    )
      throw new VoiceError("download-failed");
    const response = await fetch(url, { signal, redirect: "manual", credentials: "omit" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new VoiceError("download-failed");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new VoiceError("download-failed");
    }
    return response.body;
  }
  throw new VoiceError("download-failed");
};
export class VoiceModelStore {
  private verified = new Set<string>();
  private busy = false;
  constructor(
    private readonly root: string,
    private readonly download: DownloadClient = downloadAsset,
    private readonly assets: readonly Asset[] = speechAssets,
  ) {}
  private asset(id: string): Asset {
    const a = this.assets.find((a) => a.id === id);
    if (
      !a ||
      !/^[a-z0-9.-]+$/.test(a.id) ||
      !/^[a-z0-9.-]+$/.test(a.filename) ||
      !/^[a-f0-9]{64}$/.test(a.sha256)
    )
      throw new VoiceError("protocol-error");
    return a;
  }
  private async safe(path: string): Promise<void> {
    // Reject reparse points at every existing ancestor, including the model root.
    let current = resolve(path);
    while (true) {
      try {
        const st = await lstat(current);
        if (st.isSymbolicLink()) throw new VoiceError("integrity-failed");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  private async path(asset: Asset): Promise<string> {
    const path = join(this.root, asset.id, asset.filename);
    await this.safe(path);
    return path;
  }
  private async hash(path: string, asset: Asset, signal: AbortSignal): Promise<boolean> {
    const hash = createHash("sha256");
    let count = 0;
    try {
      for await (const chunk of createReadStream(path, { signal })) {
        count += chunk.length;
        if (count > asset.bytes) return false;
        hash.update(chunk);
      }
      return count === asset.bytes && hash.digest("hex") === asset.sha256;
    } catch (e) {
      signal.throwIfAborted();
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new VoiceError("busy");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }
  async installed(): Promise<string[]> {
    const result: string[] = [];
    for (const a of this.assets) {
      try {
        const st = await lstat(await this.path(a));
        if (
          st.isFile() &&
          st.size === a.bytes &&
          (this.verified.has(a.id) ||
            (await this.hash(await this.path(a), a, new AbortController().signal)))
        ) {
          this.verified.add(a.id);
          result.push(a.id);
        }
      } catch {
        /* unavailable */
      }
    }
    return result;
  }
  async prepare(
    id: string,
    signal: AbortSignal,
  ): Promise<{ modelPath: string; vadPath: string; modelId: "base.en" | "large-v3-turbo" }> {
    return this.exclusive(async () => {
      const model = this.asset(id);
      if (id !== "base.en" && id !== "large-v3-turbo") throw new VoiceError("protocol-error");
      const vad = this.asset(model.vad ?? "");
      for (const a of [model, vad]) {
        const p = await this.path(a);
        signal.throwIfAborted();
        if (!this.verified.has(a.id)) {
          if (!(await this.hash(p, a, signal))) throw new VoiceError("model-missing");
          this.verified.add(a.id);
        }
      }
      return { modelPath: await this.path(model), vadPath: await this.path(vad), modelId: id };
    });
  }
  async install(
    id: string,
    signal: AbortSignal,
    progress: (received: number, total: number) => void,
  ): Promise<void> {
    return this.exclusive(async () => {
      const model = this.asset(id);
      const assets = [model, this.asset(model.vad ?? "")];
      const total = assets.reduce((n, a) => n + a.bytes, 0);
      let received = 0;
      for (const a of assets) {
        const path = await this.path(a);
        const partial = `${path}.partial`;
        await this.safe(partial);
        if (await this.hash(path, a, signal)) {
          received += a.bytes;
          this.verified.add(a.id);
          progress(received, total);
          continue;
        }
        await mkdir(dirname(path), { recursive: true });
        if ((await realpath(dirname(path))) !== resolve(dirname(path)))
          throw new VoiceError("integrity-failed");
        await unlink(partial).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
        const file = await open(partial, "wx");
        let bytes = 0;
        const hash = createHash("sha256");
        try {
          const timeout = AbortSignal.timeout(30 * 60 * 1000);
          const stream = await this.download(a.url, AbortSignal.any([signal, timeout]));
          for await (const chunk of stream) {
            signal.throwIfAborted();
            bytes += chunk.byteLength;
            if (bytes > a.bytes) throw new VoiceError("integrity-failed");
            hash.update(chunk);
            let offset = 0;
            while (offset < chunk.byteLength) {
              const written = await file.write(chunk, offset);
              if (!written.bytesWritten) throw new Error("write");
              offset += written.bytesWritten;
            }
            progress(received + bytes, total);
          }
          if (bytes !== a.bytes || hash.digest("hex") !== a.sha256)
            throw new VoiceError("integrity-failed");
          signal.throwIfAborted();
          await file.sync();
          await file.close();
          await this.safe(path);
          await rename(partial, path);
          this.verified.add(a.id);
          received += bytes;
        } catch (e) {
          await file.close().catch(() => {});
          await this.safe(partial);
          await unlink(partial).catch(() => {});
          if (signal.aborted) throw new VoiceError("cancelled");
          if (e instanceof VoiceError) throw e;
          throw new VoiceError(
            (e as NodeJS.ErrnoException).code === "ENOSPC" ? "disk-full" : "download-failed",
          );
        }
      }
    });
  }
  async remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      const a = this.asset(id);
      const p = await this.path(a);
      await unlink(p).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
      this.verified.delete(id);
    });
  }
}
