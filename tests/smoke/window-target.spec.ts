import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { WindowsReader } from "../../src/main/desktop/windows-reader";

// Run the production PowerShell selection loop against a synthetic window stack.
// All native queries are substituted; this never inspects the user's desktop.
for (const scenario of [
  { name: "tool overlay", style: 0x80, foreground: false, expected: "103" },
  { name: "nonactivating overlay", style: 0x08000000, foreground: false, expected: "103" },
  { name: "ordinary topmost app", style: 0x08, foreground: false, expected: "102" },
  { name: "foreground tool window", style: 0x80, foreground: true, expected: "102" },
  { name: "foreground nonactivating window", style: 0x08000000, foreground: true, expected: "102" },
]) {
  test(`current-window selection handles ${scenario.name}`, async () => {
    test.skip(process.platform !== "win32", "Requires Windows PowerShell.");
    const reader = new WindowsReader({
      launch: (command, args, options) => {
        const encoded = args.at(-1);
        if (!encoded) throw new Error("Missing helper code");
        let code = Buffer.from(encoded, "base64").toString("utf16le");
        const start = code.indexOf("public static class CatWindowTarget {");
        const end = code.indexOf("\n'@", start);
        const readStart = code.indexOf(
          "  $root = [System.Windows.Automation.AutomationElement]::FromHandle",
        );
        if (start < 0 || end < 0 || readStart < 0)
          throw new Error("Unknown selection fixture seam");
        // Stop before UI Automation so even a regression cannot read a real HWND.
        code = `${code.slice(0, readStart)}
  $result.nativeWindowId = $identity.nativeWindowId
  $result.target = $identity.target
} catch { $result.unavailableReason = 'window-unavailable' }
$result | ConvertTo-Json -Compress -Depth 5
`;
        code = `${code.slice(0, start)}public static class CatWindowTarget {
  public static IntPtr GetForegroundWindow() { return new IntPtr(${scenario.foreground ? 102 : 101}); }
  public static IntPtr GetWindow(IntPtr hwnd, uint command) {
    return hwnd.ToInt64() < 103 ? new IntPtr(hwnd.ToInt64() + 1) : IntPtr.Zero;
  }
  public static uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId) {
    processId = hwnd.ToInt64() == 101 ? ${process.pid}u : 0u; return 1;
  }
  public static bool IsWindowVisible(IntPtr hwnd) { return true; }
  public static bool IsIconic(IntPtr hwnd) { return false; }
  public static int GetWindowLong(IntPtr hwnd, int index) {
    return hwnd.ToInt64() == 102 ? ${scenario.style} : 0;
  }
  public static int GetWindowTextLength(IntPtr hwnd) { return 20; }
  public static int DwmGetWindowAttribute(IntPtr hwnd, uint attribute, out int value, int size) {
    value = 0; return 0;
  }
}${code.slice(end)}`;
        return spawn(
          command,
          [...args.slice(0, -1), Buffer.from(code, "utf16le").toString("base64")],
          { ...options, stdio: "pipe" },
        );
      },
    });
    const result = await reader.inspectCurrentWindow(new AbortController().signal);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.nativeWindowId).toBe(scenario.expected);
    expect(result.target).toBe(scenario.foreground ? "foreground" : "behind-assistant");
  });
}
