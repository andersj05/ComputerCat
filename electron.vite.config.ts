import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { harnessGuidePlugin } from "./src/guide/build";

export default defineConfig(({ command }) => ({
  main: {
    plugins: [externalizeDepsPlugin(), harnessGuidePlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "agent-worker": resolve("src/agent/worker.ts"),
          "desktop-capture": resolve("src/main/desktop/source-capture.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } } },
  },
  renderer: {
    plugins: [
      react(),
      {
        name: "computer-cat-csp",
        transformIndexHtml(html) {
          const csp =
            command === "serve"
              ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; object-src 'none'; base-uri 'none'"
              : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
          return html.replace("__CSP__", csp);
        },
      },
    ],
  },
}));
