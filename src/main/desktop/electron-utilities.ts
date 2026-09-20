import { arch, release } from "node:os";
import { app, clipboard, shell } from "electron";
import { DesktopUtilities, type DesktopUtilityHost } from "./utilities";

export function createDesktopUtilities(smoke: boolean): DesktopUtilities {
  // Smoke mode never reads/writes the real clipboard or launches external applications.
  let fixtureClipboard = "Fixture clipboard text";
  const host: DesktopUtilityHost = smoke
    ? {
        environment: () => ({
          platform: "fixture",
          folders: { desktop: "fixture-desktop" },
          localTime: "fixture-time",
        }),
        readClipboard: async () => fixtureClipboard,
        writeClipboard: async (text) => {
          fixtureClipboard = text;
        },
        openUrl: async () => {},
        openFolder: async () => "",
        revealFile: () => {},
      }
    : {
        environment: () => ({
          platform: process.platform,
          architecture: arch(),
          osRelease: release(),
          localTime: new Date().toString(),
          utcTime: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          folders: Object.fromEntries(
            (
              ["home", "desktop", "documents", "downloads", "pictures", "music", "videos"] as const
            ).map((name) => [name, app.getPath(name)]),
          ),
          note: "Current environment only; this does not enumerate apps, files, credentials or other environment variables.",
        }),
        readClipboard: () => clipboard.readText(),
        writeClipboard: (text) => clipboard.writeText(text),
        openUrl: (url) => shell.openExternal(url),
        openFolder: (path) => shell.openPath(path),
        revealFile: (path) => shell.showItemInFolder(path),
      };
  return new DesktopUtilities(host);
}
