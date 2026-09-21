import type { WebFetcher } from "./controller";

// Explicit smoke adapter: no DNS, public network, keys or browser sessions.
export const webFixture: WebFetcher = {
  async get(url, signal) {
    signal.throwIfAborted();
    if (url.startsWith("https://html.duckduckgo.com/html/"))
      return {
        url,
        contentType: "text/html",
        body:
          new URL(url).searchParams.get("q") === "fixture browser recovery"
            ? '<form id="challenge-form">Browser check</form>'
            : '<div class="result"><a class="result__a" href="https://example.com/guide">Fixture web guide</a><span class="result__snippet">Fixture search evidence</span></div>',
      };
    if (url === "https://example.com/feed.xml")
      return {
        url,
        contentType: "application/rss+xml",
        body: '<rss version="2.0"><channel><title>Fixture feed</title><link>https://example.com</link><item><title>Fixture article</title><link>https://example.com/article</link><description>Feed excerpt</description></item></channel></rss>',
      };
    if (url === "https://example.com/article")
      return {
        url,
        contentType: "text/html",
        body: "<title>Fixture article</title><p>Independent article evidence.</p>",
      };
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
      body: `<title>Fixture web guide</title><meta name="author" content="Fixture author"><link rel="alternate" type="application/rss+xml" href="/feed.xml"><h1>Guide heading</h1><a href="/article">Related article</a><p>Offline page evidence.</p><p>${"More fixture text. ".repeat(600)}needle for web_find</p>`,
    };
  },
};
