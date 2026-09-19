export const PI_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "ls",
  "find",
  "grep",
  "bash",
  "powershell",
] as const;

export const DESKTOP_TOOL_NAMES = [
  "desktop_list_windows",
  "desktop_capture",
  "desktop_read_window",
] as const;

export const ALL_TOOL_NAMES = [...PI_TOOL_NAMES, ...DESKTOP_TOOL_NAMES] as const;

export interface ToolActivity {
  id: string;
  name: (typeof ALL_TOOL_NAMES)[number];
  state: "running" | "complete" | "error" | "stopped";
}
