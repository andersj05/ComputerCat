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

export interface ToolActivity {
  id: string;
  name: (typeof PI_TOOL_NAMES)[number];
  state: "running" | "complete" | "error" | "stopped";
}
