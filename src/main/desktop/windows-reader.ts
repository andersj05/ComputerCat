import { type ChildProcessWithoutNullStreams, type SpawnOptions, spawn } from "node:child_process";
import { win32 } from "node:path";
import { z } from "zod";
import type { DesktopReadMode, DesktopWindowText } from "../../shared/desktop";

const LIMITS = {
  timeoutMs: 8_000,
  outputBytes: 256 * 1024,
  text: 12_000,
  selectedText: 4_000,
  title: 512,
  app: 120,
  tabs: 60,
  tabTitle: 256,
} as const;

// This is fixed application code, never generated from a prompt or page. The only
// input is a validated HWND or current-window mode in the child's private environment.
// Use a separate MTA process: providers can block, including when reading our UI.
const READ_WINDOW_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$result = @{ title = ''; app = ''; text = ''; selectedText = ''; tabs = @(); truncated = $false }
$identity = @{}
$mode = $env:COMPUTERCAT_READ_MODE
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  if ($env:COMPUTERCAT_WINDOW_HANDLE) {
    $handleValue = [Int64]::Parse($env:COMPUTERCAT_WINDOW_HANDLE, [Globalization.CultureInfo]::InvariantCulture)
  } else {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CatWindowTarget {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hwnd);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, uint attribute, out int value, int size);
}
'@
    $candidate = [CatWindowTarget]::GetForegroundWindow()
    $target = 'foreground'
    $visited = New-Object 'System.Collections.Generic.HashSet[long]'
    $handleValue = 0L
    for ($attempt = 0; $attempt -lt 200 -and $candidate -ne [IntPtr]::Zero; $attempt++) {
      if (-not $visited.Add($candidate.ToInt64())) { break }
      [uint32]$windowProcess = 0
      [void][CatWindowTarget]::GetWindowThreadProcessId($candidate, [ref]$windowProcess)
      [int]$cloaked = 0
      [void][CatWindowTarget]::DwmGetWindowAttribute($candidate, 14, [ref]$cloaked, 4)
      # Floating tool windows and nonactivating overlays are poor inferred app targets.
      # Keep them readable when actually foreground or explicitly selected by HWND.
      $extendedStyle = [CatWindowTarget]::GetWindowLong($candidate, -20)
      $skipInferred = $target -eq 'behind-assistant' -and ($extendedStyle -band 0x08000080) -ne 0
      if ($windowProcess -ne [uint32]$env:COMPUTERCAT_OWNER_PID -and
          -not $skipInferred -and
          [CatWindowTarget]::IsWindowVisible($candidate) -and
          -not [CatWindowTarget]::IsIconic($candidate) -and $cloaked -eq 0 -and
          [CatWindowTarget]::GetWindowTextLength($candidate) -gt 0) {
        $handleValue = $candidate.ToInt64()
        break
      }
      # Only infer the underlying app when Computer Cat itself has the foreground.
      if ($attempt -eq 0 -and $windowProcess -ne [uint32]$env:COMPUTERCAT_OWNER_PID) { break }
      $target = 'behind-assistant'
      $candidate = [CatWindowTarget]::GetWindow($candidate, 2)
    }
    if ($handleValue -le 0) { throw 'unavailable' }
    $identity = @{ nativeWindowId = $handleValue.ToString([Globalization.CultureInfo]::InvariantCulture); target = $target }
  }
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new($handleValue))
  if ($null -eq $root) { throw 'unavailable' }
  $rootInfo = $root.Current
  if ($rootInfo.ProcessId -eq [int]$env:COMPUTERCAT_OWNER_PID -or $rootInfo.IsPassword -or $rootInfo.IsOffscreen) {
    throw 'unavailable'
  }
  $state = @{
    nodes = 0
    text = New-Object System.Text.StringBuilder
    selected = New-Object System.Text.StringBuilder
    tabs = New-Object 'System.Collections.Generic.List[string]'
    seen = New-Object 'System.Collections.Generic.HashSet[string]'
    seenSelected = New-Object 'System.Collections.Generic.HashSet[string]'
    seenTabs = New-Object 'System.Collections.Generic.HashSet[string]'
    clock = [Diagnostics.Stopwatch]::StartNew()
  }
  function Clip([string]$value, [int]$limit) {
    if ($value.Length -gt $limit) { $result.truncated = $true; return $value.Substring(0, $limit) }
    return $value
  }
  function Append-Text($builder, $seen, [string]$value, [int]$limit, [bool]$preserveSpace = $false) {
    if (-not $preserveSpace) { $value = $value.Trim() }
    if ($value.Length -eq 0) { return }
    $remaining = $limit - $builder.Length
    if ($remaining -le 1) { $result.truncated = $true; return }
    $value = Clip $value ($remaining - 1)
    if ($seen.Add($value)) {
      if ($builder.Length -gt 0) { [void]$builder.Append([char]10) }
      [void]$builder.Append($value)
    }
  }
  $result.title = Clip $rootInfo.Name 512
  try { $result.app = Clip ([Diagnostics.Process]::GetProcessById($rootInfo.ProcessId).ProcessName) 120 } catch { }
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  function Visit($element, [int]$depth) {
    if ($state.nodes -ge 600 -or $state.clock.ElapsedMilliseconds -ge 3500) {
      $result.truncated = $true
      return
    }
    $state.nodes++
    try {
      $info = $element.Current
      # Never read names, values, selections, or descendants of protected controls.
      if ($info.IsPassword -or $info.IsOffscreen) { return }
      $name = ''
      if ($mode -ne 'selection') { $name = Clip $info.Name 512 }
      if ($mode -eq 'all') { Append-Text $state.text $state.seen $name 12000 }
      if ($mode -ne 'selection' -and $info.ControlType -eq [System.Windows.Automation.ControlType]::TabItem -and $name.Length -gt 0) {
        $tabName = Clip $name 256
        if ($state.tabs.Count -ge 60) { $result.truncated = $true }
        elseif ($state.seenTabs.Add($tabName)) { $state.tabs.Add($tabName) }
      }
      $pattern = $null
      if ($mode -ne 'tabs' -and $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
        try {
          $ranges = $pattern.GetSelection()
          for ($i = 0; $i -lt [Math]::Min($ranges.Length, 16); $i++) {
            Append-Text $state.selected $state.seenSelected ($ranges[$i].GetText(4001)) 4000 $true
          }
          if ($ranges.Length -gt 16) { $result.truncated = $true }
        } catch { }
        if ($mode -eq 'all') { try {
          $ranges = $pattern.GetVisibleRanges()
          for ($i = 0; $i -lt [Math]::Min($ranges.Length, 16); $i++) {
            Append-Text $state.text $state.seen ($ranges[$i].GetText(12001)) 12000
          }
          if ($ranges.Length -gt 16) { $result.truncated = $true }
        } catch { } }
      }
      elseif ($mode -eq 'all' -and $info.ControlType -eq [System.Windows.Automation.ControlType]::Edit) {
        $pattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
          Append-Text $state.text $state.seen (Clip $pattern.Current.Value 12000) 12000
        }
      }
      $child = $walker.GetFirstChild($element)
      if ($depth -ge 14) {
        if ($null -ne $child) { $result.truncated = $true }
        return
      }
      while ($null -ne $child) {
        if ($state.nodes -ge 600 -or $state.clock.ElapsedMilliseconds -ge 3500) {
          $result.truncated = $true
          break
        }
        Visit $child ($depth + 1)
        $child = $walker.GetNextSibling($child)
      }
    } catch { $result.truncated = $true }
  }
  Visit $root 0
  $result.text = $state.text.ToString()
  $result.selectedText = $state.selected.ToString()
  $result.tabs = @($state.tabs.ToArray())
} catch {
  $result = @{ title = ''; app = ''; text = ''; selectedText = ''; tabs = @(); truncated = $false; unavailableReason = 'window-unavailable' }
}
foreach ($key in $identity.Keys) { $result[$key] = $identity[$key] }
[Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 4))
`;

const outputSchema = z
  .object({
    title: z.string().max(LIMITS.title),
    app: z.string().max(LIMITS.app),
    text: z.string().max(LIMITS.text),
    selectedText: z.string().max(LIMITS.selectedText),
    tabs: z.array(z.string().max(LIMITS.tabTitle)).max(LIMITS.tabs),
    truncated: z.boolean(),
    unavailableReason: z.literal("window-unavailable").optional(),
    nativeWindowId: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .optional(),
    target: z.enum(["foreground", "behind-assistant"]).optional(),
  })
  .strict();

function unavailable(reason: string): DesktopWindowText {
  return {
    title: "",
    app: "",
    text: "",
    selectedText: "",
    tabs: [],
    truncated: false,
    unavailableReason: reason,
  };
}

function cancelled(): DOMException {
  return new DOMException("Desktop reading was cancelled.", "AbortError");
}

export interface CurrentWindowInspection extends DesktopWindowText {
  nativeWindowId?: string;
  target?: "foreground" | "behind-assistant";
}

interface ReaderOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  launch?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcessWithoutNullStreams;
}

/** Read only the selected window; never activates it or touches the clipboard. */
export class WindowsReader {
  private readonly platform: NodeJS.Platform;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly launch: NonNullable<ReaderOptions["launch"]>;

  constructor(options: ReaderOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.environment = options.environment ?? process.env;
    this.launch =
      options.launch ??
      ((command, args, launchOptions) => spawn(command, args, { ...launchOptions, stdio: "pipe" }));
  }

  async inspectWindow(
    nativeWindowId: string,
    signal: AbortSignal,
    mode: DesktopReadMode = "all",
  ): Promise<DesktopWindowText> {
    if (signal.aborted) throw cancelled();
    // IntPtr is signed; disallow zero, leading zeroes, signs, whitespace and code.
    if (
      !/^[1-9]\d{0,18}$/.test(nativeWindowId) ||
      BigInt(nativeWindowId) > 0x7fff_ffff_ffff_ffffn
    ) {
      return unavailable("The selected window is no longer available. Choose it again.");
    }
    return this.inspect(nativeWindowId, signal, mode);
  }

  inspectCurrentWindow(
    signal: AbortSignal,
    mode: DesktopReadMode = "all",
  ): Promise<CurrentWindowInspection> {
    return this.inspect(undefined, signal, mode);
  }

  private async inspect(
    nativeWindowId: string | undefined,
    signal: AbortSignal,
    mode: DesktopReadMode,
  ): Promise<CurrentWindowInspection> {
    if (signal.aborted) throw cancelled();
    if (!["all", "selection", "tabs"].includes(mode))
      return unavailable("Unsupported text reading mode.");
    if (this.platform !== "win32") {
      return unavailable("Reading application text is currently available on Windows only.");
    }
    const systemRoot = this.environment.SystemRoot ?? this.environment.WINDIR;
    if (!systemRoot || !win32.isAbsolute(systemRoot)) {
      return unavailable("Windows accessibility reading is unavailable on this computer.");
    }
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
      const value = this.environment[key];
      if (value) env[key] = value;
    }
    env.COMPUTERCAT_WINDOW_HANDLE = nativeWindowId ?? "";
    // This fixed helper needs no discovery or per-user module analysis cache.
    env.PSModuleAnalysisCachePath = "NUL";
    env.COMPUTERCAT_OWNER_PID = String(process.pid);
    env.COMPUTERCAT_READ_MODE = mode;

    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.launch(
        win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Mta",
          "-EncodedCommand",
          Buffer.from(READ_WINDOW_SCRIPT, "utf16le").toString("base64"),
        ],
        { env, shell: false, windowsHide: true, stdio: "pipe" },
      );
    } catch {
      return unavailable("Windows accessibility reading could not start. Try again.");
    }

    return new Promise<CurrentWindowInspection>((resolve, reject) => {
      let done = false;
      let bytes = 0;
      const chunks: Buffer[] = [];
      const finish = (result: CurrentWindowInspection | DOMException, kill = false) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        chunks.length = 0;
        if (kill) {
          try {
            child.kill();
          } catch {
            // Never expose process errors or accessibility text in diagnostics.
          }
        }
        if (result instanceof DOMException) reject(result);
        else resolve(result);
      };
      const abort = () => finish(cancelled(), true);
      const timer = setTimeout(
        () =>
          finish(unavailable("The application did not respond to accessibility reading."), true),
        LIMITS.timeoutMs,
      );
      child.on("error", () =>
        finish(unavailable("Windows accessibility reading could not start. Try again."), true),
      );
      child.stdin.on("error", () =>
        finish(unavailable("Windows accessibility reading ended unexpectedly."), true),
      );
      child.stdout.on("error", () =>
        finish(unavailable("Windows accessibility reading ended unexpectedly."), true),
      );
      child.stderr.on("error", () =>
        finish(unavailable("Windows accessibility reading ended unexpectedly."), true),
      );
      child.stdout.on("data", (chunk: Buffer) => {
        if (done) return;
        bytes += chunk.length;
        if (bytes > LIMITS.outputBytes) {
          finish(unavailable("The application returned too much accessibility data."), true);
          return;
        }
        chunks.push(chunk);
      });
      child.once("close", (code) => {
        if (done) return;
        if (signal.aborted) {
          abort();
          return;
        }
        if (code !== 0) {
          finish(unavailable("Windows accessibility reading ended unexpectedly."));
          return;
        }
        try {
          const parsed = outputSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          const text = parsed.unavailableReason
            ? unavailable("This window does not expose readable accessibility content.")
            : {
                title: parsed.title,
                app: parsed.app,
                text: parsed.text,
                selectedText: parsed.selectedText,
                tabs: parsed.tabs,
                truncated: parsed.truncated,
              };
          finish({
            ...text,
            ...(parsed.nativeWindowId ? { nativeWindowId: parsed.nativeWindowId } : {}),
            ...(parsed.target ? { target: parsed.target } : {}),
          });
        } catch {
          finish(unavailable("The application returned unreadable accessibility data."));
        }
      });
      // Drain errors without retaining potentially private provider messages.
      child.stderr.resume();
      child.stdin.end();
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}

export function inspectWindow(
  nativeWindowId: string,
  signal: AbortSignal,
  mode?: DesktopReadMode,
): Promise<DesktopWindowText> {
  return new WindowsReader().inspectWindow(nativeWindowId, signal, mode);
}

export function inspectCurrentWindow(
  signal: AbortSignal,
  mode?: DesktopReadMode,
): Promise<CurrentWindowInspection> {
  return new WindowsReader().inspectCurrentWindow(signal, mode);
}
