import { nativeImage } from "electron";
import type { DesktopWindowText } from "../../shared/desktop";
import type { DesktopProvider, DesktopSource } from "./controller";

// Only constructed in smoke mode. No OS enumeration or inspection, even on unexpected calls.
export function desktopFixture(enabled: boolean): DesktopProvider {
  const source: DesktopSource = { id: "window:123:0", name: "Fixture help page", kind: "window" };
  const text: DesktopWindowText = {
    title: source.name,
    app: "Fixture browser",
    text: "This help page explains saving a document.",
    selectedText: "Save your changes",
    tabs: ["Fixture help page", "Fixture notes"],
    truncated: false,
  };
  return {
    list: async () => (enabled ? [source] : []),
    current: async () => (enabled ? { source, target: "behind-assistant", text } : undefined),
    read: async () => {
      if (!enabled) throw new Error("No fixture");
      return text;
    },
    capture: async () => {
      if (!enabled) throw new Error("No fixture");
      return {
        width: 1,
        height: 1,
        data: nativeImage
          .createFromBitmap(Buffer.from([40, 100, 180, 255]), { width: 1, height: 1 })
          .toPNG()
          .toString("base64"),
      };
    },
  };
}
