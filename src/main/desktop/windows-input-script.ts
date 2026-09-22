// Fixed application code. All variable input arrives as JSON on a private stdin pipe.
// A separate MTA process bounds blocking accessibility providers and owns injected key pairs.
export const WINDOWS_INPUT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
Add-Type -ReferencedAssemblies @(
  [System.Windows.Automation.AutomationElement].Assembly.Location,
  [System.Windows.Automation.ControlType].Assembly.Location,
  [System.Windows.Rect].Assembly.Location
) -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Automation;

public static class CatInput {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LastInput info);
  [DllImport("user32.dll")] static extern uint SendInput(uint count, Input[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] struct LastInput { public uint size, tick; }
  [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct Mouse { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Keyboard keyboard; [FieldOffset(0)] public Mouse mouse; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union data; }
  sealed class Rejected : Exception { public readonly string reason; public Rejected(string value) { reason = value; } }
  static string Clip(string value, int limit) { value = value ?? ""; return value.Length > limit ? value.Substring(0, limit) : value; }
  static uint LastTick() { var info = new LastInput { size = (uint)Marshal.SizeOf(typeof(LastInput)) }; if (!GetLastInputInfo(ref info)) throw new Rejected("unavailable"); return info.tick; }
  static string Start(int pid) { return Process.GetProcessById(pid).StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture); }
  static Hashtable Box(Rect rect) { return new Hashtable { {"x", rect.X}, {"y", rect.Y}, {"width", rect.Width}, {"height", rect.Height} }; }
  static string RectKey(Rect rect) { return rect.ToString(CultureInfo.InvariantCulture); }
  static bool Pattern(AutomationElement node, AutomationPattern pattern, out object value) { return node.TryGetCurrentPattern(pattern, out value); }
  static bool Writable(AutomationElement node) {
    var info = node.Current;
    if (!info.IsEnabled || info.IsPassword || !info.IsKeyboardFocusable ||
        (info.ControlType != ControlType.Edit && info.ControlType != ControlType.Document)) return false;
    object pattern;
    if (Pattern(node, ValuePattern.Pattern, out pattern)) return !((ValuePattern)pattern).Current.IsReadOnly;
    if (Pattern(node, TextPattern.Pattern, out pattern)) {
      object readOnly = ((TextPattern)pattern).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);
      return readOnly is bool && !(bool)readOnly;
    }
    return false;
  }
  static string Value(AutomationElement node) {
    object value;
    if (node.Current.IsPassword) throw new Rejected("unavailable");
    // A browser Document ValuePattern can contain its entire data: URL rather
    // than editor text. Values belong only to editors in this input snapshot.
    if (node.Current.ControlType != ControlType.Edit && !Writable(node)) return null;
    if (Pattern(node, ValuePattern.Pattern, out value)) return ((ValuePattern)value).Current.Value;
    if (Writable(node) && Pattern(node, TextPattern.Pattern, out value)) return ((TextPattern)value).DocumentRange.GetText(8001);
    return null;
  }
  static string[] Actions(AutomationElement node) {
    var result = new List<string>();
    if (!node.Current.IsEnabled) return result.ToArray();
    object pattern;
    if (Pattern(node, InvokePattern.Pattern, out pattern) || Pattern(node, SelectionItemPattern.Pattern, out pattern) ||
        Pattern(node, TogglePattern.Pattern, out pattern) || Pattern(node, ExpandCollapsePattern.Pattern, out pattern)) result.Add("click");
    // SetValue is only for editors, never a Document URL or a read-only label.
    if (Writable(node)) {
      if (Pattern(node, ValuePattern.Pattern, out pattern) && !((ValuePattern)pattern).Current.IsReadOnly) result.Add("fill");
      result.Add("type");
    }
    if (node.Current.IsKeyboardFocusable) result.Add("key");
    if (Pattern(node, ScrollPattern.Pattern, out pattern) &&
        (((ScrollPattern)pattern).Current.VerticallyScrollable || ((ScrollPattern)pattern).Current.HorizontallyScrollable)) result.Add("scroll");
    return result.ToArray();
  }
  static string Signature(AutomationElement node) {
    var info = node.Current;
    string name = info.Name ?? "";
    string value = Value(node) ?? "";
    string data = name.Length + ":" + name + value.Length + ":" + value + ":" + info.ControlType.Id + ":" +
      info.IsEnabled + ":" + RectKey(info.BoundingRectangle) + ":" + String.Join(",", node.GetRuntimeId());
    using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(data))).Replace("-", "").ToLowerInvariant();
  }
  static AutomationElement Root(long handle, int owner) {
    var hwnd = new IntPtr(handle);
    if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) throw new Rejected("unavailable");
    var node = AutomationElement.FromHandle(hwnd);
    var info = node.Current;
    if (info.ProcessId == owner || info.IsPassword || info.IsOffscreen || info.BoundingRectangle.IsEmpty) throw new Rejected("unavailable");
    return node;
  }
  static void Walk(AutomationElement root, Func<AutomationElement, bool> visit, ref bool truncated) {
    var watch = Stopwatch.StartNew();
    var pending = new Stack<Tuple<AutomationElement, int>>();
    pending.Push(Tuple.Create(root, 0));
    int count = 0;
    var walker = TreeWalker.ControlViewWalker;
    while (pending.Count > 0 && count < 2000 && watch.ElapsedMilliseconds < 3500) {
      var item = pending.Pop();
      count++;
      try {
        var info = item.Item1.Current;
        if (info.IsPassword) continue;
        // Layout containers can be offscreen/empty while a descendant is visible.
        if (!info.IsOffscreen && !info.BoundingRectangle.IsEmpty && visit(item.Item1)) return;
        if (item.Item2 >= 32) { truncated = true; continue; }
        var children = new List<AutomationElement>();
        var child = walker.GetFirstChild(item.Item1);
        while (child != null && children.Count + count + pending.Count < 2000 && watch.ElapsedMilliseconds < 3500) {
          children.Add(child); child = walker.GetNextSibling(child);
        }
        if (child != null) truncated = true;
        for (int i = children.Count - 1; i >= 0; i--) pending.Push(Tuple.Create(children[i], item.Item2 + 1));
      } catch { truncated = true; }
    }
    if (pending.Count > 0) truncated = true;
  }
  public static Hashtable Inspect(long handle, string expectedTitle, int owner, string query) {
    uint last = LastTick();
    string foreground = GetForegroundWindow().ToInt64().ToString(CultureInfo.InvariantCulture);
    var root = Root(handle, owner);
    var info = root.Current;
    if (expectedTitle != null && Clip(info.Name, 512) != expectedTitle) throw new Rejected("stale");
    var elements = new List<Hashtable>();
    var text = new StringBuilder();
    var seen = new HashSet<string>();
    bool clipped = false;
    bool truncated = false;
    Walk(root, delegate(AutomationElement node) {
      var current = node.Current;
      string name = Clip(current.Name, 512);
      string value = Value(node);
      foreach (string part in new string[] { name, Clip(value, 8000) }) {
        if (part.Length == 0 || !seen.Add(part)) continue;
        int remaining = 12000 - text.Length;
        if (remaining <= 1) { clipped = true; continue; }
        text.Append(Clip(part, remaining - 1)); text.Append('\n');
        if (part.Length >= remaining) clipped = true;
      }
      // Filter before the output limit so browser chrome cannot crowd out Reply.
      if (!String.IsNullOrEmpty(query) && name.IndexOf(query, StringComparison.OrdinalIgnoreCase) < 0) return false;
      string[] actions = Actions(node);
      if (actions.Length == 0 && current.ControlType != ControlType.Edit && current.ControlType != ControlType.Button) return false;
      if (elements.Count >= 60) { clipped = true; return !String.IsNullOrEmpty(query); }
      var element = new Hashtable { {"runtimeId", node.GetRuntimeId()}, {"name", name},
        {"role", current.ControlType.ProgrammaticName.Replace("ControlType.", "")}, {"enabled", current.IsEnabled},
        {"bounds", Box(current.BoundingRectangle)}, {"signature", Signature(node)}, {"actions", actions} };
      if (value != null) { element["value"] = Clip(value, 8000); if (value.Length > 8000) clipped = true; }
      elements.Add(element);
      return false;
    }, ref truncated);
    return new Hashtable { {"windowHandle", handle.ToString(CultureInfo.InvariantCulture)}, {"processId", info.ProcessId},
      {"processStarted", Start(info.ProcessId)}, {"foreground", foreground}, {"lastInput", last},
      {"title", Clip(info.Name, 512)}, {"app", Clip(Process.GetProcessById(info.ProcessId).ProcessName, 120)},
      {"bounds", Box(info.BoundingRectangle)}, {"text", text.ToString()}, {"truncated", truncated || clipped}, {"elements", elements.ToArray()} };
  }
  static bool SameId(int[] first, int[] second) {
    if (first.Length != second.Length) return false;
    for (int i = 0; i < first.Length; i++) if (first[i] != second[i]) return false;
    return true;
  }
  static void NoHeldKeys() {
    foreach (int key in new int[] { 1, 2, 4, 16, 17, 18, 91, 92 })
      if ((GetAsyncKeyState(key) & 0x8000) != 0) throw new Rejected("user-input");
  }
  static void Focus(IntPtr hwnd, AutomationElement node) {
    NoHeldKeys();
    // Let the accessibility provider focus its editor first; some providers activate
    // their window as part of SetFocus. Never inject until both checks succeed.
    node.SetFocus();
    if (GetForegroundWindow() != hwnd) {
      if (!SetForegroundWindow(hwnd)) throw new Rejected("focus");
    }
    for (int attempt = 0; attempt < 20; attempt++) {
      if (GetForegroundWindow() != hwnd) throw new Rejected("focus");
      if (Automation.Compare(AutomationElement.FocusedElement, node)) return;
      Thread.Sleep(10);
    }
    CheckFocus(hwnd, node);
  }
  static void CheckFocus(IntPtr hwnd, AutomationElement node) {
    if (GetForegroundWindow() != hwnd || !Automation.Compare(AutomationElement.FocusedElement, node)) throw new Rejected("focus");
  }
  static Input Key(ushort code, bool up, bool unicode) {
    return new Input { type = 1, data = new Union { keyboard = new Keyboard {
      key = unicode ? (ushort)0 : code, scan = unicode ? code : (ushort)0, flags = (unicode ? 4u : 0u) | (up ? 2u : 0u) } } };
  }
  static void Send(Input[] events) {
    if (SendInput((uint)events.Length, events, Marshal.SizeOf(typeof(Input))) != events.Length) throw new Rejected("failed");
  }
  static void Press(string key) {
    ushort modifier = 0;
    if (key.StartsWith("Control+")) { modifier = 17; key = key.Substring(8); }
    if (key.StartsWith("Shift+")) { modifier = 16; key = key.Substring(6); }
    var codes = new Dictionary<string, ushort> { {"Tab",9}, {"Escape",27}, {"Enter",13}, {"Space",32},
      {"Backspace",8}, {"Delete",46}, {"ArrowLeft",37}, {"ArrowRight",39}, {"ArrowUp",38}, {"ArrowDown",40},
      {"Home",36}, {"End",35}, {"PageUp",33}, {"PageDown",34}, {"A",65}, {"Z",90}, {"Y",89} };
    ushort code;
    if (!codes.TryGetValue(key, out code)) throw new Rejected("unsupported");
    var events = new List<Input>();
    if (modifier != 0) events.Add(Key(modifier, false, false));
    events.Add(Key(code, false, false)); events.Add(Key(code, true, false));
    if (modifier != 0) events.Add(Key(modifier, true, false));
    try { Send(events.ToArray()); }
    catch { SendInput(1, new Input[] { Key(code, true, false) }, Marshal.SizeOf(typeof(Input)));
      if (modifier != 0) SendInput(1, new Input[] { Key(modifier, true, false) }, Marshal.SizeOf(typeof(Input)));
      throw; }
  }
  static void TypeText(IntPtr hwnd, AutomationElement node, string text) {
    // Chromium ignores VK_PACKET line-break characters. Use the editor soft-break
    // chord for literal newlines, never an unmodified Enter or trailing submit key.
    text = text.Replace("\r\n", "\n").Replace("\r", "\n");
    // Each pair is queued together. Keep batches small so loss of focus stops further text.
    for (int offset = 0; offset < text.Length;) {
      CheckFocus(hwnd, node); NoHeldKeys();
      if (text[offset] == '\n') {
        Press("Shift+Enter"); offset++; Thread.Sleep(10); continue;
      }
      int end = Math.Min(text.Length, offset + 16);
      int newline = text.IndexOf('\n', offset);
      if (newline >= 0 && newline < end) end = newline;
      if (end < text.Length && Char.IsHighSurrogate(text[end - 1]) && Char.IsLowSurrogate(text[end])) end++;
      var events = new List<Input>();
      for (int i = offset; i < end; i++) {
        events.Add(Key(text[i], false, true)); events.Add(Key(text[i], true, true));
      }
      Send(events.ToArray());
      offset = end;
      Thread.Sleep(10);
    }
  }
  public static Hashtable Act(long handle, int pid, string started, string title, double[] box,
      string foreground, uint last, int[] runtimeId, string signature,
      string kind, string text, string key, string direction, string amount, int owner) {
    bool dispatched = false;
    var result = new Hashtable();
    try {
      var root = Root(handle, owner);
      var info = root.Current;
      if (info.ProcessId != pid || Start(pid) != started || Clip(info.Name, 512) != title ||
          info.BoundingRectangle != new Rect(box[0], box[1], box[2], box[3])) throw new Rejected("stale");
      if (GetForegroundWindow().ToInt64().ToString(CultureInfo.InvariantCulture) != foreground || LastTick() != last) throw new Rejected("user-input");
      AutomationElement target = null;
      bool truncated = false;
      Walk(root, delegate(AutomationElement node) {
        if (!SameId(node.GetRuntimeId(), runtimeId)) return false;
        target = node; return true;
      }, ref truncated);
      if (target == null || Signature(target) != signature) throw new Rejected("stale");
      if (Array.IndexOf(Actions(target), kind) < 0) throw new Rejected("unsupported");
      // Recheck after traversal: a slow provider must not hide intervening user activity.
      if (GetForegroundWindow().ToInt64().ToString(CultureInfo.InvariantCulture) != foreground || LastTick() != last) throw new Rejected("user-input");
      NoHeldKeys();
      object pattern;
      if (kind == "type" || kind == "key") {
        Focus(new IntPtr(handle), target);
        // Focusing can run app handlers or scroll the editor. Revalidate before input.
        if (Signature(target) != signature) throw new Rejected("stale");
        CheckFocus(new IntPtr(handle), target); NoHeldKeys();
        dispatched = true;
        if (kind == "type") TypeText(new IntPtr(handle), target, text);
        else Press(key);
      } else if (kind == "fill") {
        if (!Pattern(target, ValuePattern.Pattern, out pattern)) throw new Rejected("unsupported");
        if (target.Current.FrameworkId == "Chrome") {
          // Chromium's ValuePattern changes contenteditable DOM without firing
          // input events. Use actual editor input so the web app receives edits.
          Focus(new IntPtr(handle), target);
          if (Signature(target) != signature) throw new Rejected("stale");
          object range;
          if (!Pattern(target, TextPattern.Pattern, out range)) throw new Rejected("unsupported");
          dispatched = true;
          ((TextPattern)range).DocumentRange.Select();
          CheckFocus(new IntPtr(handle), target); NoHeldKeys();
          if (text.Length == 0) Press("Backspace"); else TypeText(new IntPtr(handle), target, text);
        } else {
          dispatched = true; ((ValuePattern)pattern).SetValue(text);
        }
      } else if (kind == "click") {
        if (Pattern(target, InvokePattern.Pattern, out pattern)) { dispatched = true; ((InvokePattern)pattern).Invoke(); }
        else if (Pattern(target, SelectionItemPattern.Pattern, out pattern)) { dispatched = true; ((SelectionItemPattern)pattern).Select(); }
        else if (Pattern(target, TogglePattern.Pattern, out pattern)) { dispatched = true; ((TogglePattern)pattern).Toggle(); }
        else if (Pattern(target, ExpandCollapsePattern.Pattern, out pattern)) {
          var expand = (ExpandCollapsePattern)pattern; dispatched = true;
          if (expand.Current.ExpandCollapseState == ExpandCollapseState.Collapsed) expand.Expand(); else expand.Collapse();
        } else throw new Rejected("unsupported");
      } else if (kind == "scroll") {
        if (!Pattern(target, ScrollPattern.Pattern, out pattern)) throw new Rejected("unsupported");
        bool decrease = direction == "up" || direction == "left";
        ScrollAmount step = amount == "large" ? (decrease ? ScrollAmount.LargeDecrement : ScrollAmount.LargeIncrement) :
          (decrease ? ScrollAmount.SmallDecrement : ScrollAmount.SmallIncrement);
        dispatched = true;
        ((ScrollPattern)pattern).Scroll(direction == "left" || direction == "right" ? step : ScrollAmount.NoAmount,
          direction == "up" || direction == "down" ? step : ScrollAmount.NoAmount);
      } else throw new Rejected("unsupported");
      result["status"] = "dispatched"; result["reason"] = "ok";
    } catch (Exception error) {
      result["status"] = dispatched ? "uncertain" : "rejected";
      result["reason"] = error is Rejected ? ((Rejected)error).reason : "failed";
    }
    try {
      // Bounded settling, not a claim that navigation/network activity has completed.
      Thread.Sleep(80);
      var after = Inspect(handle, null, owner, null);
      if ((int)after["processId"] == pid && (string)after["processStarted"] == started) result["snapshot"] = after;
    } catch { }
    return result;
  }
}
'@
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $owner = [int]$env:COMPUTERCAT_OWNER_PID
  if ($request.operation -eq 'inspect') {
    $result = [CatInput]::Inspect([long]$request.handle, [string]$request.title, $owner, [string]$request.query)
  } elseif ($request.operation -eq 'act') {
    $s = $request.snapshot
    $e = $request.element
    $a = $request.action
    $box = [double[]]@($s.bounds.x, $s.bounds.y, $s.bounds.width, $s.bounds.height)
    $result = [CatInput]::Act([long]$s.windowHandle, [int]$s.processId, [string]$s.processStarted,
      [string]$s.title, $box, [string]$s.foreground, [uint32]$s.lastInput, [int[]]$e.runtimeId,
      [string]$e.signature, [string]$a.kind, [string]$a.text, [string]$a.key,
      [string]$a.direction, [string]$a.amount, $owner)
  } else { throw 'invalid-operation' }
  [Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 8))
} catch {
  [Console]::Out.Write('{"status":"rejected","reason":"unavailable"}')
}
`;
