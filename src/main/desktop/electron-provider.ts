import { BrowserWindow, desktopCapturer } from "electron";
import type { DesktopWindowText } from "../../shared/desktop";
import type { CurrentDesktopWindow, DesktopProvider, DesktopSource } from "./controller";
import { SourceCapturer } from "./source-capture";
import { inspectCurrentWindow, inspectWindow } from "./windows-reader";

export class ElectronDesktopProvider implements DesktopProvider {
  constructor(private readonly capturer: Pick<SourceCapturer, "capture"> = new SourceCapturer()) {}
  async current(signal: AbortSignal): Promise<CurrentDesktopWindow | undefined> {
    const { nativeWindowId, target, ...text } = await inspectCurrentWindow(signal);
    signal.throwIfAborted();
    if (!nativeWindowId || !target) return undefined;
    const source = (await this.list(signal)).find(
      (item) =>
        item.kind === "window" && /^window:(\d+):\d+$/.exec(item.id)?.[1] === nativeWindowId,
    );
    if (!source || (text.title && text.title !== source.name.slice(0, 512))) return undefined;
    return { source, target, text };
  }
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
    const current = (await this.list(signal)).find(
      (item) => item.id === source.id && item.name === source.name,
    );
    if (!current) throw new Error("Source unavailable");
    const image = await this.capturer.capture(current.id, signal);
    // A title/identity change during startup must not silently replace the requested app.
    if (
      !(await this.list(signal)).some((item) => item.id === source.id && item.name === source.name)
    )
      throw new Error("Source changed");
    return image;
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
