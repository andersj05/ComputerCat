import { useState } from "react";
import type { ToolActivity as Activity } from "../../shared/tools";

export const TOOL_LABELS: Record<Activity["name"], string> = {
  read: "Read file",
  write: "Write file",
  edit: "Edit file",
  ls: "List files",
  find: "Find files",
  grep: "Search files",
  bash: "Run Bash",
  powershell: "Run PowerShell",
  desktop_observe: "Read screen",
  desktop_list_windows: "Find windows",
  desktop_capture: "Capture window",
  desktop_read_window: "Read window",
  desktop_read_selection: "Read selected text",
  desktop_list_tabs: "Read browser tabs",
  desktop_capture_region: "Inspect screen region",
};
const states = { running: "Running…", complete: "Done", error: "Failed", stopped: "Stopped" };

export function ToolActivity({ tools }: { tools: Activity[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!tools.length) return null;
  const running = tools.filter((tool) => tool.state === "running");
  const failures = tools.filter((tool) => tool.state === "error").length;
  const visible = expanded ? tools : running.length ? running : tools.slice(-1);
  return (
    <div className="tool-progress">
      <button
        type="button"
        className="text-button tool-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "▾" : "▸"} Tool activity · {tools.length}{" "}
        {tools.length === 1 ? "step" : "steps"}
        {failures ? ` · ${failures} failed` : ""}
      </button>
      <ul className="tool-activity" aria-label="Tool activity">
        {visible.map((tool) => (
          <li key={tool.id} data-state={tool.state} title={tool.name}>
            <span className="tool-state-mark" aria-hidden="true">
              {tool.state === "running"
                ? "●"
                : tool.state === "complete"
                  ? "✓"
                  : tool.state === "error"
                    ? "!"
                    : "■"}
            </span>
            <span>{TOOL_LABELS[tool.name]}</span>
            <small>{states[tool.state]}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
