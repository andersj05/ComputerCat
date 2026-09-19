import { ALL_TOOL_NAMES, DESKTOP_TOOL_NAMES, type ToolActivity } from "../shared/tools";

interface ToolGuide {
  title: string;
  purpose: string;
  returns: string;
  limit: string;
}

// Exhaustive on purpose: adding/removing a registered tool also requires updating its guide.
const descriptions = {
  desktop_observe: {
    title: "Look at the current app",
    purpose: "Start here for “What is this page?” or “Explain this error.”",
    returns: "App identity, accessible text, selection, exposed tabs and a screenshot.",
    limit:
      "Uses the foreground app, or infers the app behind the cat. Text-only models omit the image. Available text survives a capture failure.",
  },
  desktop_list_windows: {
    title: "Find an open window",
    purpose: "Find a named app or choose between several windows.",
    returns: "Window and display titles with temporary source IDs. No thumbnails.",
    limit: "IDs belong to this reply, expire after 60 seconds, and are replaced by a new listing.",
  },
  desktop_capture: {
    title: "Capture one source",
    purpose: "Take a fresh picture of a window or display already identified this turn.",
    returns: "An image of that exact source, up to 1920 × 1080.",
    limit:
      "Needs an image-capable model. Protected or unavailable sources can fail; the tool does not switch to a whole display.",
  },
  desktop_read_window: {
    title: "Read accessible window text",
    purpose: "Read a chosen window without taking a screenshot.",
    returns:
      "Text and controls exposed by Windows accessibility, including available selection and tab titles.",
    limit: "Coverage depends on the app. Custom controls and hidden pages may be missing.",
  },
  desktop_read_selection: {
    title: "Read highlighted text",
    purpose: "Explain, summarize or rewrite the text you have selected.",
    returns: "Only exposed selected text and its source; whitespace is preserved.",
    limit:
      "Does not select, copy or change anything. An empty result does not prove nothing is selected.",
  },
  desktop_list_tabs: {
    title: "Read exposed tab titles",
    purpose: "Understand which tabs the current app or a chosen browser exposes.",
    returns: "Tab titles without full page text or screenshots.",
    limit: "Not a complete browser inventory. It cannot read background tab contents.",
  },
  desktop_capture_region: {
    title: "Look closer at a detail",
    purpose: "Inspect small text, a diagram or an error inside an observed source.",
    returns: "A fresh image cropped before downsizing.",
    limit:
      "Coordinates are fractions from 0 to 1. The rectangle must fit inside the source; image support is required.",
  },
  read: {
    title: "Read a file",
    purpose: "Inspect a file relevant to the request.",
    returns: "File content through Pi’s built-in reader.",
    limit: "Uses the current user’s file permissions. Relative paths start at Desktop.",
  },
  write: {
    title: "Write a file",
    purpose: "Create a file or replace its contents when requested.",
    returns: "The outcome of the write.",
    limit: "Changes files on disk. Deleting the conversation does not undo the write.",
  },
  edit: {
    title: "Edit a file",
    purpose: "Make a targeted change to an existing file.",
    returns: "The outcome of the edit.",
    limit:
      "Changes files with the current user’s permissions; there is no OS sandbox around these tools.",
  },
  ls: {
    title: "List a folder",
    purpose: "See the files and folders in a directory.",
    returns: "Directory entries.",
    limit: "This inspects the filesystem, not the list of applications or browser tabs.",
  },
  find: {
    title: "Find files by name",
    purpose: "Locate files matching a path or name pattern.",
    returns: "Matching file paths.",
    limit: "Pi may download its fd helper into the app’s cache on first use.",
  },
  grep: {
    title: "Search inside files",
    purpose: "Find text in files relevant to the request.",
    returns: "Matching text with file locations.",
    limit: "Pi may download its ripgrep helper into the app’s cache on first use.",
  },
  bash: {
    title: "Run a Bash command",
    purpose: "Use a shell for an authorized task that needs it.",
    returns: "Command output and status.",
    limit:
      "Requires an installed Bash executable. Commands have the user’s OS permissions and can change the computer.",
  },
  powershell: {
    title: "Run a PowerShell command",
    purpose: "Use the preferred Windows shell for an authorized task.",
    returns: "Command output and status.",
    limit:
      "Commands have the user’s OS permissions. Prompt guidance is not a per-command approval broker or an OS sandbox.",
  },
} satisfies Record<ToolActivity["name"], ToolGuide>;

export const guideTools = ALL_TOOL_NAMES.map((name) => ({
  name,
  group: (DESKTOP_TOOL_NAMES as readonly string[]).includes(name) ? "desktop" : "files",
  ...descriptions[name],
}));
