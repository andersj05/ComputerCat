import {
  ALL_TOOL_NAMES,
  DESKTOP_TOOL_NAMES,
  DESKTOP_UTILITY_TOOL_NAMES,
  type ToolActivity,
  WEB_TOOL_NAMES,
} from "../shared/tools";

interface ToolGuide {
  title: string;
  purpose: string;
  returns: string;
  limit: string;
}

// Exhaustive on purpose: adding/removing a registered tool also requires updating its guide.
const descriptions = {
  desktop_inspect: {
    title: "Inspect app for actions",
    purpose: "Find the intended editor, button or scroll area in an app.",
    returns:
      "Visible text, field values and up to sixty controls with disposable observation and element IDs.",
    limit:
      "Windows accessibility only. Targets expire after sixty seconds, a fresh inspection, any action, or turn end. No background scan.",
  },
  desktop_click: {
    title: "Activate an app control",
    purpose: "Invoke a button, select a tab, toggle or expand an observed control.",
    returns: "Dispatch/rejection status and fresh accessible state when available.",
    limit:
      "Requires an advertised click action and unchanged native target. Drafting does not authorize sending.",
  },
  desktop_fill: {
    title: "Fill an app field",
    purpose: "Replace a writable editor's value, including a multiline draft.",
    returns: "Action status and fresh field contents for verification.",
    limit: "Up to 8,000 characters. Requires ValuePattern support; does not send Enter or submit.",
  },
  desktop_type_text: {
    title: "Type into an editor",
    purpose: "Insert literal Unicode text at the observed editor's caret or selection.",
    returns: "Action status and fresh accessible state.",
    limit:
      "Requires a writable, focusable editor. Existing selection may be replaced; input already dispatched cannot be undone by Stop.",
  },
  desktop_press_key: {
    title: "Press a key in an app",
    purpose: "Use a bounded navigation/editing key in an observed control.",
    returns: "Action status and fresh accessible state.",
    limit:
      "Focus is verified. Enter/Space may submit and require authorization for that effect; no arbitrary hotkeys.",
  },
  desktop_scroll: {
    title: "Scroll an app region",
    purpose: "Reveal more content using an observed scrollable control.",
    returns: "Action status and newly exposed controls when available.",
    limit:
      "One small or large increment. Unsupported custom/canvas controls require another route.",
  },
  web_get_status: {
    title: "Check web capabilities",
    purpose: "See which search routes and reading formats are available.",
    returns: "Configured providers, browser fallback availability and tool limits.",
    limit: "Configuration only; it does not test connectivity or reveal credentials.",
  },
  web_read_many: {
    title: "Read several sources",
    purpose: "Compare or corroborate up to three public sources together.",
    returns:
      "A separate page reference and 4,000-character excerpt per source, or its specific error.",
    limit:
      "The public-reader rules apply to every URL. Each read uses one of eight cached page slots.",
  },
  web_list_links: {
    title: "Explore page links",
    purpose: "Find a profile, related article, documentation or other relevant source link.",
    returns: "20 links per page, optional title/URL filtering, stable indexes and pagination.",
    limit:
      "Up to 200 links retained from the cached static page. Links are not automatically visited.",
  },
  web_follow_link: {
    title: "Follow a source link",
    purpose: "Read a link already discovered on a relevant page.",
    returns: "A fresh page reference, verified final URL and readable text.",
    limit:
      "Uses the public reader and validates redirects again. Does not click browser controls or submit forms.",
  },
  web_read_metadata: {
    title: "Inspect source details",
    purpose: "Check a page's description, author, dates, structure and available feeds.",
    returns: "Available metadata, up to 40 headings and five RSS/Atom feed links.",
    limit:
      "These are claims by the source; missing values remain missing and do not prove identity or publication date.",
  },
  web_read_feed: {
    title: "Read a news feed",
    purpose: "Review recent articles from a known public RSS or Atom feed.",
    returns: "Up to 20 entries with source links, dates and short descriptions.",
    limit:
      "Read the linked article for details. No subscription, background polling or attachment downloads.",
  },
  desktop_search_browser: {
    title: "Search in your browser",
    purpose: "Continue research without an API key when direct search is unavailable.",
    returns:
      "Dispatch status and the Google search URL; the cat must observe the browser to read results.",
    limit:
      "Changes browser focus. Does not prove the page loaded, read hidden tabs or bypass browser challenges.",
  },
  desktop_read_page: {
    title: "Read page identity",
    purpose: "Identify the document or find its source address without a screenshot.",
    returns: "Up to eight exposed document titles, with HTTP/HTTPS URLs where supported.",
    limit:
      "These are accessibility candidates, not verified active-tab navigation. Some apps expose no URL. No browser history, hidden tabs or page body is read.",
  },
  desktop_list_controls: {
    title: "Read app controls",
    purpose: "Explain available buttons, fields, links and settings in an app.",
    returns: "Up to sixty visible named controls, their roles and enabled states.",
    limit:
      "No field values or actionable handles. Does not click, focus or change controls. Coverage depends on the app.",
  },
  desktop_find_text: {
    title: "Find text in an app",
    purpose: "Locate an error, phrase or heading in a fresh window observation.",
    returns:
      "Up to five short matching excerpts and snapshot offsets, with source truncation and further-match flags.",
    limit:
      "Literal case-insensitive search of at most 12,000 exposed characters. Does not use the app's Find command, scroll or search hidden content.",
  },
  web_read: {
    title: "Read a public web page",
    purpose: "Read a known URL without opening the browser.",
    returns:
      "Title, source URL, retrieval time, links and the first 8,000 characters with a page reference.",
    limit:
      "Static public HTML/text/Markdown/JSON only. No cookies, JavaScript, sign-in, PDFs, images or private-network access. Source text is capped at 100,000 characters.",
  },
  web_read_more: {
    title: "Read more of a page",
    purpose: "Continue through a long page already retrieved this turn.",
    returns: "The next 8,000 characters at a supplied offset from the same snapshot.",
    limit:
      "References expire after five minutes or the turn ends. A truncated source cannot supply text beyond the extraction cap.",
  },
  web_find: {
    title: "Find text on a page",
    purpose: "Locate a phrase in a previously retrieved page.",
    returns: "Up to five excerpts with offsets and an indication of further matches.",
    limit:
      "Literal case-insensitive search of retained text only; it cannot see hidden or dynamic content.",
  },
  web_search: {
    title: "Search the public web",
    purpose: "Find current sources without requiring an API key.",
    returns:
      "Up to five source links and snippets, or a browser-search dispatch that the cat must observe.",
    limit:
      "Tries configured Brave, keyless DuckDuckGo, then the default browser. Browser fallback changes focus and may require you to handle a challenge. Snippets are not full pages.",
  },
  desktop_get_environment: {
    title: "Get time and standard folders",
    purpose: "Find the current date, time zone, OS and common folder locations without guessing.",
    returns:
      "Current local/UTC time, OS information, and home, Desktop, Documents, Downloads and media paths.",
    limit: "Does not scan files, apps, credentials or environment variables.",
  },
  desktop_read_clipboard: {
    title: "Read copied text",
    purpose: "Work with text you ask the cat to read from your clipboard.",
    returns: "Up to 8,000 characters of plain text, with a truncation flag.",
    limit:
      "No images, files or clipboard history. The prompt restricts reading to clipboard requests; it is not an enforced permission mode. Text goes to the selected model and saved context.",
  },
  desktop_write_clipboard: {
    title: "Copy text",
    purpose: "Put requested text on the clipboard ready for you to paste.",
    returns: "A write result and character count.",
    limit:
      "Replaces existing clipboard contents. Up to 8,000 characters. Does not paste into another app.",
  },
  desktop_open_url: {
    title: "Open a web link",
    purpose: "Open a requested web page in your default browser.",
    returns: "Confirmation that the request was handed to the browser, not that the page loaded.",
    limit:
      "HTTP/HTTPS only, without embedded credentials. This does not search or read the web. Observe afterward to verify the page.",
  },
  desktop_open_folder: {
    title: "Open a folder",
    purpose: "Show an existing local folder in your file manager.",
    returns: "Dispatch status after checking that the absolute path is a directory.",
    limit:
      "No network/device paths. Does not launch files or executables. Window contents require a fresh observation.",
  },
  desktop_reveal_file: {
    title: "Show a file in its folder",
    purpose: "Reveal a file the cat found or created when you want to see its location.",
    returns: "Dispatch status after checking an existing absolute local path.",
    limit:
      "Does not open or execute the file. Selection depends on the file manager; observe to verify.",
  },
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
  group: (DESKTOP_TOOL_NAMES as readonly string[]).includes(name)
    ? "desktop"
    : (DESKTOP_UTILITY_TOOL_NAMES as readonly string[]).includes(name)
      ? "utilities"
      : (WEB_TOOL_NAMES as readonly string[]).includes(name)
        ? "web"
        : "files",
  ...descriptions[name],
}));
