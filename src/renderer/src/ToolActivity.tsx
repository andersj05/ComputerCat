import { useId, useState } from "react";
import type { ToolActivity as Activity } from "../../shared/tools";
import { Icon, type IconName } from "./Icon";

const TOOL_ICONS: Record<Activity["name"], IconName> = {
  read: "file",
  write: "file",
  edit: "file",
  ls: "folder",
  find: "search",
  grep: "search",
  bash: "terminal",
  powershell: "terminal",
  desktop_observe: "desktop",
  desktop_list_windows: "tabs",
  desktop_capture: "camera",
  desktop_read_window: "file",
  desktop_read_selection: "selection",
  desktop_list_tabs: "tabs",
  desktop_capture_region: "camera",
  desktop_read_page: "web",
  desktop_list_controls: "options",
  desktop_find_text: "search",
  desktop_get_environment: "desktop",
  desktop_read_clipboard: "clipboard",
  desktop_write_clipboard: "clipboard",
  desktop_open_url: "web",
  desktop_open_folder: "folder",
  desktop_reveal_file: "folder",
  web_read: "web",
  web_read_more: "web",
  web_find: "search",
  web_search: "search",
};

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
  desktop_read_page: "Read page address",
  desktop_list_controls: "Read app controls",
  desktop_find_text: "Find text in app",
  desktop_get_environment: "Get time and folders",
  desktop_read_clipboard: "Read clipboard text",
  desktop_write_clipboard: "Copy text",
  desktop_open_url: "Open web link",
  desktop_open_folder: "Open folder",
  desktop_reveal_file: "Show file in folder",
  web_read: "Read web page",
  web_read_more: "Read more of page",
  web_find: "Find text on page",
  web_search: "Search web",
};
const states = { running: "Running…", complete: "Done", error: "Failed", stopped: "Stopped" };

export function ToolActivity({ tools, compact = false }: { tools: Activity[]; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!tools.length) return null;
  const running = tools.filter((tool) => tool.state === "running");
  const current = running[0];
  const failures = tools.filter((tool) => tool.state === "error").length;
  const stopped = tools.filter((tool) => tool.state === "stopped").length;
  const headline = current ?? tools.at(-1);
  const visible = expanded ? tools : running.length ? running : tools.slice(-1);
  return (
    <div className={`tool-progress ${compact ? "compact" : ""}`} data-running={!!current}>
      <button
        type="button"
        className="text-button tool-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        {headline && <Icon name={TOOL_ICONS[headline.name]} />}
        <span className="tool-summary">
          <span>{current ? `${TOOL_LABELS[current.name]}…` : "Tool activity"}</span>
          <span className="tool-count">
            {tools.length} {tools.length === 1 ? "step" : "steps"}
            {failures ? <span className="tool-failures"> · {failures} failed</span> : ""}
            {stopped ? ` · ${stopped} stopped` : ""}
          </span>
        </span>
      </button>
      {(!compact || expanded) && (
        <ul id={listId} className="tool-activity" aria-label="Tool activity">
          {visible.map((tool) => (
            <li key={tool.id} data-state={tool.state} title={tool.name}>
              <Icon name={TOOL_ICONS[tool.name]} />
              <span className="tool-label">{TOOL_LABELS[tool.name]}</span>
              <small>
                <span className="tool-state-mark" aria-hidden="true">
                  {tool.state === "running"
                    ? "●"
                    : tool.state === "complete"
                      ? "✓"
                      : tool.state === "error"
                        ? "!"
                        : "■"}
                </span>
                {states[tool.state]}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
