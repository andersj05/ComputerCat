import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

// Run from the repository root. No dependencies, network, Git, or agent state required.
const root = realpathSync(process.cwd());
const failures = [];
const documents = new Map();
const routes = {
  "AGENTS.md": ["docs/memory/README.md", "docs/memory/current-state.md"],
  "CLAUDE.md": ["AGENTS.md"],
  "GEMINI.md": ["AGENTS.md"],
  ".github/copilot-instructions.md": ["AGENTS.md"],
  "README.md": ["AGENTS.md", "docs/memory/README.md"],
  "CONTRIBUTING.md": ["docs/memory/README.md"],
  "docs/memory/README.md": [
    "docs/memory/current-state.md",
    "docs/memory/decisions.md",
    "docs/memory/gotchas.md",
    "docs/memory/handoffs/README.md",
  ],
  "docs/memory/handoffs/README.md": ["docs/memory/handoffs/TEMPLATE.md"],
};
const required = new Set([...Object.keys(routes), ...Object.values(routes).flat()]);
const startupLimits = {
  "AGENTS.md": 8192,
  "docs/memory/README.md": 8192,
  "docs/memory/current-state.md": 6144,
};

function outsideRoot(path) {
  const fromRoot = relative(root, path);
  return fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
}

function collect(directory, recursive) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    // Inspect shared docs only, not ignored personal context or hidden scratch directories.
    if (entry.name.startsWith(".") || entry.name === "CLAUDE.local.md") continue;
    const file = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      if (recursive || file.endsWith(".md"))
        failures.push(`${file}: context must not be a symlink`);
    } else if (entry.isDirectory() && recursive) {
      collect(file, true);
    } else if (entry.isFile() && file.endsWith(".md")) {
      documents.set(file, readFileSync(resolve(root, file), "utf8"));
    }
  }
}

function proseOnly(markdown) {
  let fence;
  return markdown
    .split(/\r?\n/)
    .filter((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (!fence) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
        return false;
      }
      return !fence;
    })
    .join("\n")
    .replace(/(`+)[^\n]*?\1/g, "");
}

function localTarget(file, reference, isImport = false) {
  if (!isImport && /^(?:https?:|mailto:|#)/i.test(reference)) return;
  try {
    const target = decodeURIComponent(reference.split(/[?#]/)[0]);
    if (!target || /^[a-z][a-z\d+.-]*:|^[\\/]/i.test(target) || isAbsolute(target)) {
      throw new Error("use a relative repository path");
    }
    const absolute = resolve(root, dirname(file), target);
    if (outsideRoot(absolute)) throw new Error("target escapes the repository");
    if (outsideRoot(realpathSync(absolute)))
      throw new Error("target resolves outside the repository");
    return relative(root, absolute).split(sep).join("/");
  } catch (error) {
    const reason = error.code === "ENOENT" ? "target does not exist" : error.message;
    failures.push(`${file}: ${reference}: ${reason}`);
  }
}

try {
  collect("", false);
  for (const directory of ["docs", ".github"]) {
    if (!lstatSync(resolve(root, directory)).isDirectory()) {
      throw new Error(`${directory} must be a regular directory`);
    }
    collect(directory, true);
  }
  const { scripts = {} } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  for (const file of required) {
    if (!documents.get(file)?.trim())
      failures.push(`${file}: required context is missing or empty`);
  }

  for (const [file, content] of documents) {
    const prose = proseOnly(content);
    const references = new Set();
    // Inline links, including angle-bracket paths and optional quoted titles.
    const links = /\[[^\]\n]*\]\((?:<([^>\n]+)>|([^\s)\n]+))(?:\s+"[^"\n]*")?\)/g;
    for (const match of prose.matchAll(links)) {
      references.add(localTarget(file, match[1] ?? match[2]));
    }
    if (file === "CLAUDE.md" || file === "GEMINI.md") {
      const imports = [...prose.matchAll(/^\s*@([^\s]+)[ \t]*$/gm)];
      for (const match of imports) references.add(localTarget(file, match[1], true));
      if (!imports.some((match) => /^(?:\.\/)?AGENTS\.md$/.test(match[1]))) {
        failures.push(`${file}: must import AGENTS.md on its own line`);
      }
      if (Buffer.byteLength(content) > 1024) failures.push(`${file}: keep the adapter under 1 KiB`);
    }
    for (const target of routes[file] ?? []) {
      if (!references.has(target)) failures.push(`${file}: missing route to ${target}`);
    }
    // Commands in code examples are checked too; never executed.
    for (const match of content.matchAll(/\bnpm(?:\.cmd)?\s+run\s+([a-z][\w:-]*)/g)) {
      if (!Object.hasOwn(scripts, match[1])) {
        failures.push(`${file}: unknown npm script ${match[1]}`);
      }
    }
    const limit = startupLimits[file];
    if (limit && Buffer.byteLength(content) > limit)
      failures.push(`${file}: exceeds ${limit} bytes`);
  }
  const startupBytes = Object.keys(startupLimits).reduce(
    (sum, file) => sum + Buffer.byteLength(documents.get(file) ?? ""),
    0,
  );
  if (startupBytes > 16 * 1024)
    failures.push(`Startup context exceeds 16 KiB (${startupBytes} bytes)`);
} catch (error) {
  failures.push(`Cannot check project memory: ${error.message}`);
}

if (failures.length) {
  for (const failure of new Set(failures)) console.error(`Memory check: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Memory check passed: ${documents.size} Markdown files; entry points, local targets, npm scripts, and context budgets checked.`,
  );
}
