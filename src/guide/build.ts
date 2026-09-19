import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { guideTools } from "./catalog";

export function harnessGuidePlugin(): Plugin {
  const sources = [
    "src/guide/index.html",
    "src/guide/style.css",
    "src/guide/interactions.js",
    "src/guide/catalog.ts",
    "src/shared/tools.ts",
    "src/renderer/src/tokens.css",
    "assets/computer_cat.png",
    "package.json",
  ];
  return {
    name: "computer-cat-harness-guide",
    buildStart() {
      for (const path of sources) this.addWatchFile(resolve(path));
    },
    generateBundle() {
      // HTML normalizes line endings before checking inline content hashes.
      const read = (path: string) => readFileSync(resolve(path), "utf8").replace(/\r\n?/g, "\n");
      const data = JSON.stringify(guideTools).replaceAll("<", "\\u003c");
      const script = read("src/guide/interactions.js").replace("/*__TOOLS__*/ []", data);
      const css = `${read("src/renderer/src/tokens.css")}\n${read("src/guide/style.css")}`;
      const hash = (value: string) => createHash("sha256").update(value).digest("base64");
      const csp = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(css)}'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
      const html = read("src/guide/index.html")
        .replace("__CSP__", csp)
        .replace("/*__STYLE__*/", css)
        .replace("/*__SCRIPT__*/", script)
        .replace("__PI_COUNT__", String(guideTools.filter((tool) => tool.group === "files").length))
        .replace(
          "__DESKTOP_COUNT__",
          String(guideTools.filter((tool) => tool.group === "desktop").length),
        )
        .replaceAll("__VERSION__", JSON.parse(read("package.json")).version as string)
        .replace("__CAT__", readFileSync(resolve("assets/computer_cat.png")).toString("base64"));
      this.emitFile({ type: "asset", fileName: "harness-guide.html", source: html });
    },
  };
}
