import { BrowserWindow, desktopCapturer } from "electron";
import type { DesktopWindowText } from "../../shared/desktop";
import type { DesktopProvider, DesktopSource } from "./controller";
import { inspectWindow } from "./windows-reader";

export class ElectronDesktopProvider implements DesktopProvider {
  private isOwnWindow(id: string): boolean {
    const handle = /^window:(\d+):/.exec(id)?.[1];
    if (!handle) return false;
    return BrowserWindow.getAllWindows().some((window) => {
      if (window.isDestroyed()) return false;
      const bytes = window.getNativeWindowHandle();
      return (
        (bytes.length >= 8 ? bytes.readBigUInt64LE() : BigInt(bytes.readUInt32LE())).toString() ===
        handle
      );
    });
  }

  async list(signal: AbortSignal): Promise<DesktopSource[]> {
    signal.throwIfAborted();
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    signal.throwIfAborted();
    return sources
      .filter((source) => !this.isOwnWindow(source.id))
      .map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith("window:") ? "window" : "screen",
      }));
  }

  async capture(source: DesktopSource, signal: AbortSignal) {
    signal.throwIfAborted();
    // Electron returns thumbnails for this source class; only the selected source leaves main.
    const sources = await desktopCapturer.getSources({
      types: [source.kind],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: false,
    });
    signal.throwIfAborted();
    const current = sources.find(
      (item) => item.id === source.id && item.name === source.name && !this.isOwnWindow(item.id),
    );
    if (!current || current.thumbnail.isEmpty()) throw new Error("Source unavailable");
    const image = current.thumbnail;
    const size = image.getSize();
    if (size.width > 1920 || size.height > 1080) throw new Error("Unexpected image dimensions");
    const data = image.toPNG().toString("base64");
    if (data.length > 8_000_000) throw new Error("Image too large");
    return { data, ...size };
  }

  async read(source: DesktopSource, signal: AbortSignal): Promise<DesktopWindowText> {
    const current = (await this.list(signal)).find(
      (item) => item.id === source.id && item.name === source.name,
    );
    const handle =
      current?.kind === "window" ? /^window:(\d+):\d+$/.exec(current.id)?.[1] : undefined;
    if (!handle) throw new Error("Source unavailable");
    const result = await inspectWindow(handle, signal);
    signal.throwIfAborted();
    if (result.title && result.title !== source.name.slice(0, 512))
      throw new Error("Window changed");
    return result;
  }
}
