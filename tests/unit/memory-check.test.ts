import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const checker = resolve("scripts/check-memory.mjs");
let directory: string;

function write(file: string, content: string) {
  const path = join(directory, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function check() {
  const result = spawnSync(process.execPath, [checker], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  expect(result.error).toBeUndefined();
  return result;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "computercat-memory-check-"));
  const fixture: Record<string, string> = {
    "package.json": JSON.stringify({ scripts: { verify: "unused", "memory:check": "unused" } }),
    "AGENTS.md": "[Guide](docs/memory/README.md)\n[State](docs/memory/current-state.md)",
    "CLAUDE.md": "@AGENTS.md\n",
    "GEMINI.md": "@./AGENTS.md\n",
    ".github/copilot-instructions.md": "Read [instructions](../AGENTS.md).",
    "README.md": "[Instructions](AGENTS.md)\n[Memory](docs/memory/README.md)",
    "CONTRIBUTING.md": "[Memory](docs/memory/README.md)\nRun `npm run verify`.",
    "docs/memory/README.md":
      "[State](current-state.md)\n[Decisions](decisions.md)\n[Pitfalls](gotchas.md)\n[Handoffs](handoffs/README.md)",
    "docs/memory/current-state.md": "# Current state\nA reviewed fact.",
    "docs/memory/decisions.md": "# Decisions\nAn adopted choice.",
    "docs/memory/gotchas.md": "# Known pitfalls\nA verified remedy.",
    "docs/memory/handoffs/README.md": "Copy [template](TEMPLATE.md).",
    "docs/memory/handoffs/TEMPLATE.md": "# Handoff template\nObjective, evidence, next action.",
  };
  for (const [file, content] of Object.entries(fixture)) write(file, content);
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("offline project memory check", () => {
  it("works without dependencies or Git and accepts local paths, fragments, and external links", () => {
    write("docs/a file.md", "# Local evidence");
    write(
      "docs/links.md",
      '[Encoded](a%20file.md#heading)\n[Bracketed](<a file.md>)\n[Root](../README.md "Title")\n[External](https://example.invalid/never-fetched)\n[Here](#heading)\nRun `npm.cmd run memory:check`.',
    );
    const result = check();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Memory check passed");
  });

  it("reports missing entry points and broken relative links with their source file", () => {
    rmSync(join(directory, "CLAUDE.md"));
    write("docs/broken.md", "[Evidence](missing.ts)");
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLAUDE.md: required context is missing");
    expect(result.stderr).toContain("docs/broken.md: missing.ts: target does not exist");
  });

  it("requires native imports and a route from the instructions to the shared context", () => {
    write("CLAUDE.md", "[Instructions](AGENTS.md)");
    write("AGENTS.md", "# Instructions without a memory route");
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLAUDE.md: must import AGENTS.md");
    expect(result.stderr).toContain("AGENTS.md: missing route to docs/memory/README.md");
  });

  it("rejects paths outside the repository and invalid import targets", () => {
    write("docs/escape.md", "[Outside](../../outside.md)\n[Absolute](/outside.md)");
    write("GEMINI.md", "@./AGENTS.md\n@https://example.invalid/context.md\n");
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("target escapes the repository");
    expect(result.stderr).toContain("use a relative repository path");
    expect(result.stderr).toContain("GEMINI.md: https://example.invalid/context.md");
  });

  it("checks documented npm commands without executing them", () => {
    write("docs/commands.md", "```sh\nnpm run vanished\n```");
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("docs/commands.md: unknown npm script vanished");
  });

  it("ignores example links inside inline code and both kinds of code fence", () => {
    write(
      "docs/examples.md",
      "`[Example](missing.md)`\n```md\n[Example](missing.md)\n```\n~~~md\n[Example](missing.md)\n~~~",
    );
    const result = check();
    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects oversized startup context", () => {
    write("docs/memory/current-state.md", "x".repeat(6145));
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("docs/memory/current-state.md: exceeds 6144 bytes");
  });

  it("does not parse ignored personal notes or hidden scratch directories", () => {
    const privateNote = "[Private](missing-private-file.md)\nRun `npm run private-command`.";
    write("CLAUDE.local.md", privateNote);
    write(".local/task.md", privateNote);
    write("docs/.local/task.md", privateNote);
    const result = check();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("12 Markdown files");
  });

  it("fails clearly when the package metadata is unreadable", () => {
    write("package.json", "{invalid}");
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cannot check project memory");
  });
});
