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
  "desktop_observe",
  "desktop_list_windows",
  "desktop_capture",
  "desktop_read_window",
  "desktop_read_selection",
  "desktop_list_tabs",
  "desktop_capture_region",
  "desktop_read_page",
  "desktop_list_controls",
  "desktop_find_text",
] as const;

export const DESKTOP_UTILITY_TOOL_NAMES = [
  "desktop_get_environment",
  "desktop_read_clipboard",
  "desktop_write_clipboard",
  "desktop_open_url",
  "desktop_open_folder",
  "desktop_reveal_file",
] as const;

export const WEB_TOOL_NAMES = ["web_read", "web_read_more", "web_find", "web_search"] as const;

export const ALL_TOOL_NAMES = [
  ...PI_TOOL_NAMES,
  ...DESKTOP_TOOL_NAMES,
  ...DESKTOP_UTILITY_TOOL_NAMES,
  ...WEB_TOOL_NAMES,
] as const;

export interface ToolActivity {
  id: string;
  name: (typeof ALL_TOOL_NAMES)[number];
  state: "running" | "complete" | "error" | "stopped";
}
