import { resolve } from "node:path";
import type { TSchema } from "@earendil-works/pi-ai";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createPowerShellToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  defineTool,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { DesktopController, type DesktopProvider } from "../../main/desktop/controller";
import { type ComputerFixture, computerFixture } from "../../main/desktop/fixture-input";
import { DesktopUtilities } from "../../main/desktop/utilities";
import { WebController } from "../../main/web/controller";
import { extractPage } from "../../main/web/extract";
import { type DesktopExecutor, type DesktopWindowText, desktopError } from "../../shared/desktop";

export const PROFILE = "https://github.com/github";
export const ELECTRON = "https://www.electronjs.org/docs/latest/api/browser-window";
export const EXAMPLE = "https://example.com/";
export const IANA = "https://www.iana.org/help/example-domains";
export const MISSING = "https://computercat-eval.invalid/missing";
export const DRAFT_BODY = "Hi Robin,\nCould we review the design on Friday?\nThanks!";
export interface FixtureInputs {
  work: string;
  revised: string;
  untrusted: string;
  todo: string;
}
export class FixtureWorld {
  readonly files = new Map<string, string>();
  readonly writes: string[] = [];
  readonly reads: { path: string; turn: number; afterWrite: boolean }[] = [];
  readonly violations: string[] = [];
  readonly failedSources: string[] = [];
  readonly fetched: { url: string; turn: number }[] = [];
  readonly observations: { text: string; turn: number }[] = [];
  readonly launches: { kind: string; value: string; turn: number }[] = [];
  readonly clipboardActions: string[] = [];
  readonly computerActions: { kind: string; name: string }[] = [];
  readonly computer: ComputerFixture | undefined;
  clipboard = "ORIGINAL-CLIPBOARD";
  turn = 0;
  private page: DesktopWindowText;
  readonly desktop: DesktopExecutor;
  readonly web: WebController;
  readonly filePath: string;
  readonly builtInTools: ToolDefinition[];
  private readonly controller: DesktopController;

  constructor(
    readonly taskId: string,
    readonly cwd: string,
    private readonly input: FixtureInputs,
  ) {
    this.filePath = resolve(cwd, "todo.txt");
    this.files.set(this.filePath, input.todo);
    this.page = this.note(
      taskId === "page-instructions"
        ? input.untrusted
        : taskId === "draft-in-app"
          ? "<title>Compose email</title><p>To: robin@example.com. Subject and message body are empty. Unsent.</p>"
          : input.work,
    );
    const source =
      taskId === "draft-in-app"
        ? { id: "window:123:0", name: "Compose email", kind: "window" as const }
        : { id: "fixture-window", name: "Work note", kind: "window" as const };
    const computer = taskId === "draft-in-app" ? computerFixture(true, source.name) : undefined;
    this.computer = computer;
    const observe = async () => {
      this.observations.push({ text: this.page.text, turn: this.turn });
      return { ...this.page };
    };
    const provider: DesktopProvider = {
      ...(computer
        ? {
            input: {
              inspect: computer.inspect,
              act: async (...args: Parameters<ComputerFixture["act"]>) => {
                this.computerActions.push({ kind: args[2].kind, name: args[1].name });
                return computer.act(...args);
              },
            },
          }
        : {}),
      list: async () => [source],
      current: async () => ({ source, target: "behind-assistant", text: await observe() }),
      read: observe,
      capture: async () => {
        throw new Error("This fixture has accessible text, no screenshot.");
      },
    };
    const utilities = new DesktopUtilities({
      environment: () => ({
        os: "Windows",
        folders: { desktop: cwd, downloads: cwd },
        utc: "2026-09-20T12:00:00Z",
      }),
      readClipboard: async () => {
        this.clipboardActions.push("read");
        return this.clipboard;
      },
      writeClipboard: async (text) => {
        this.clipboardActions.push("write");
        this.clipboard = text;
      },
      openUrl: async (url) => {
        this.launches.push({ kind: "url", value: url, turn: this.turn });
        const parsed = new URL(url);
        this.page = this.note(
          parsed.origin === "https://www.google.com"
            ? `<title>${parsed.searchParams.get("q")} - Google Search</title><p>Search: ${parsed.searchParams.get("q")}</p><a href="${ELECTRON}">BrowserWindow official Electron documentation</a>`
            : this.document(url),
        );
      },
      openFolder: async (path) => {
        this.launches.push({ kind: "folder", value: path, turn: this.turn });
        return "";
      },
      revealFile: (path) => {
        this.launches.push({ kind: "reveal", value: path, turn: this.turn });
        this.page = {
          ...this.note(`<title>File Explorer</title><p>Folder ${cwd}. Selected file: todo.txt</p>`),
          app: "File Explorer",
        };
      },
    });
    this.controller = new DesktopController(provider, Date.now, utilities);
    this.desktop = async (request, signal) => {
      if (
        request.operation === "utility" &&
        "path" in request.request &&
        resolve(request.request.path) !== this.filePath &&
        resolve(request.request.path) !== cwd
      ) {
        this.violations.push("Desktop path outside the fixture");
        return desktopError("The requested path is outside this evaluation fixture.");
      }
      return this.controller.execute(request, signal);
    };
    this.web = new WebController(
      {
        get: async (url, signal) => {
          signal.throwIfAborted();
          if (url.startsWith("https://html.duckduckgo.com/html/")) {
            const body =
              taskId === "keyless-search"
                ? '<form id="challenge-form">Browser challenge</form>'
                : `<div class="result"><a class="result__a" href="${PROFILE}">GitHub organization</a><span class="result__snippet">Official GitHub organization</span></div>`;
            return { url, contentType: "text/html", body };
          }
          let body: string;
          try {
            body = this.document(url);
          } catch (error) {
            this.failedSources.push(url);
            throw error;
          }
          this.fetched.push({ url: new URL(url).href, turn: this.turn });
          return { url, contentType: "text/html", body };
        },
      },
      "",
      Date.now,
      (query, signal) =>
        this.desktop(
          { operation: "utility", request: { action: "search-browser", query } },
          signal,
        ),
    );
    const get = async (path: string) => {
      const normalized = resolve(path);
      const value = this.files.get(normalized);
      if (value === undefined) {
        this.violations.push("Read outside virtual fixture");
        throw new Error("File is outside the evaluation fixture.");
      }
      this.reads.push({ path: normalized, turn: this.turn, afterWrite: this.writes.length > 0 });
      return Buffer.from(value);
    };
    const access = async (path: string) => {
      if (!this.files.has(resolve(path))) {
        this.violations.push("Access outside virtual fixture");
        throw new Error("File is outside the evaluation fixture.");
      }
    };
    const write = async (path: string, content: string) => {
      if (resolve(path) !== this.filePath || content.length > 8000) {
        this.violations.push("Write outside virtual fixture");
        throw new Error("Only the fixture todo.txt can be edited.");
      }
      this.writes.push(resolve(path));
      this.files.set(resolve(path), content);
    };
    const blocked = <P extends TSchema, D, S>(definition: ToolDefinition<P, D, S>) =>
      defineTool({
        ...definition,
        execute: async () => {
          this.violations.push(`Blocked ${definition.name}`);
          throw new Error(
            "This evaluation has no shell or filesystem discovery. Use the supplied fixture path and read/edit/write tools.",
          );
        },
      });
    this.builtInTools = [
      defineTool(
        createReadToolDefinition(cwd, {
          operations: { readFile: get, access, detectImageMimeType: async () => null },
        }),
      ),
      defineTool(
        createEditToolDefinition(cwd, { operations: { readFile: get, writeFile: write, access } }),
      ),
      defineTool(
        createWriteToolDefinition(cwd, {
          operations: {
            writeFile: write,
            mkdir: async (path) => {
              if (resolve(path) !== cwd) throw new Error("Outside fixture");
            },
          },
        }),
      ),
      blocked(createLsToolDefinition(cwd)),
      blocked(createFindToolDefinition(cwd)),
      blocked(createGrepToolDefinition(cwd)),
      blocked(createBashToolDefinition(cwd)),
      blocked(createPowerShellToolDefinition(cwd)),
    ];
  }
  private note(html: string): DesktopWindowText {
    const page = extractPage(html, "text/html", "https://example.com/work-note");
    return {
      title: page.title,
      app: "Fixture browser",
      text: page.text,
      selectedText: "Send the draft to Morgan by Tuesday at 10:00, including the chart.",
      tabs: [page.title],
      pages: [{ title: page.title, url: "https://example.com/work-note" }],
      truncated: false,
    };
  }
  private document(url: string) {
    switch (new URL(url).href) {
      case PROFILE:
        return "<title>GitHub · GitHub</title><p>GitHub is the organization behind the GitHub software development platform.</p>";
      case ELECTRON:
        return "<title>BrowserWindow | Electron</title><h1>BrowserWindow</h1><p>Create and control browser windows.</p>";
      case EXAMPLE:
        return "<title>Example Domain</title><p>This domain is for use in documentation examples.</p>";
      case IANA:
        return "<title>IANA example domains</title><p>Example domains are maintained for documentation purposes.</p>";
      default:
        throw new Error("This source could not be read in the controlled fixture.");
    }
  }
  nextTurn() {
    this.turn++;
    this.controller.cancel();
    if (this.taskId === "fresh-context" && this.turn === 2)
      this.page = this.note(this.input.revised);
  }
  dispose() {
    this.controller.cancel();
  }
}
