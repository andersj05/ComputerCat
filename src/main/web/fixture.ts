import type { WebFetcher } from "./controller";

// Explicit smoke adapter: no DNS, public network, keys or browser sessions.
export const webFixture: WebFetcher = {
  async get(url, signal) {
    signal.throwIfAborted();
    if (url.startsWith("https://api.search.brave.com/"))
      return {
        url,
        contentType: "application/json",
        body: JSON.stringify({
          web: {
            results: [
              {
                title: "Fixture web guide",
                url: "https://example.com/guide",
                description: "Fixture search evidence",
              },
            ],
          },
        }),
      };
    if (url !== "https://example.com/guide") throw new Error("Unexpected fixture URL");
    return {
      url,
      contentType: "text/html",
      body: `<title>Fixture web guide</title><p>Offline page evidence.</p><p>${"More fixture text. ".repeat(600)}needle for web_find</p>`,
    };
  },
};
