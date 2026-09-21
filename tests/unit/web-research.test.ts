import { afterEach, describe, expect, it, vi } from "vitest";
import { WebController, type WebFetcher } from "../../src/main/web/controller";
import { extractPage } from "../../src/main/web/extract";
import { extractFeed } from "../../src/main/web/feed";
import type { WebResult } from "../../src/shared/web";

const meta = (result: WebResult) => JSON.parse(result.content[0]?.text ?? "{}");
const article = `<title>Research page</title><meta name="description" content="A useful description"><meta name="author" content="Fixture author"><meta property="article:published_time" content="2026-09-20"><link rel="canonical" href="/canonical"><link rel="alternate" type="application/rss+xml" href="/feed.xml"><h1>Visible heading</h1><div hidden><h2>Hidden heading</h2></div>${Array.from({ length: 205 }, (_, i) => `<a href="/article/${i}">Article ${i}</a>`).join("")}<p>${"Evidence ".repeat(1000)}</p>`;
function setup() {
  const fetcher = {
    get: vi
      .fn<WebFetcher["get"]>()
      .mockImplementation(async (url) => ({ url, contentType: "text/html", body: article })),
  };
  const controller = new WebController(fetcher, "secret-canary");
  const turn = new AbortController();
  const execute = (request: unknown) => controller.execute(request, turn.signal);
  return { fetcher, controller, turn, execute };
}
afterEach(() => vi.useRealTimers());

describe("source research tools", () => {
  it("reports actual configuration without contacting providers or exposing credentials", async () => {
    const { execute, fetcher } = setup();
    const response = await execute({ operation: "status" });
    expect(meta(response).search).toEqual({
      requiresKey: false,
      providers: ["Brave Search", "DuckDuckGo HTML"],
      browserFallback: false,
    });
    expect(JSON.stringify(response)).not.toContain("secret-canary");
    expect(fetcher.get).not.toHaveBeenCalled();
  });
  it("paginates and filters links with stable indexes, follows an observed target, and expires references", async () => {
    const { execute, fetcher, turn, controller } = setup();
    const page = meta(await execute({ operation: "read", url: "https://example.com/source" }));
    expect(page).toMatchObject({ totalLinks: 200, linksTruncated: true, nextLinksStart: 20 });
    const links = meta(await execute({ operation: "links", pageId: page.pageId, start: 20 }));
    expect(links.links[0]).toMatchObject({ index: 20, url: "https://example.com/article/20" });
    const filtered = meta(
      await execute({ operation: "links", pageId: page.pageId, query: "ARTICLE 19" }),
    );
    expect(filtered.links[0].index).toBe(19);
    expect(filtered.links[1].index).toBe(190);
    expect(fetcher.get).toHaveBeenCalledOnce();
    const next = meta(
      await execute({ operation: "follow", pageId: page.pageId, index: filtered.links[1].index }),
    );
    expect(next.url).toBe("https://example.com/article/190");
    expect(next.pageId).not.toBe(page.pageId);
    turn.abort();
    expect(
      (
        await controller.execute(
          { operation: "follow", pageId: page.pageId, index: 0 },
          new AbortController().signal,
        )
      ).isError,
    ).toBe(true);
    expect(fetcher.get).toHaveBeenCalledTimes(2);
  });
  it("reads metadata from the same snapshot, strips hidden headings and rejects unsafe source links", async () => {
    const { execute, fetcher } = setup();
    const page = meta(await execute({ operation: "read", url: "https://example.com/source" }));
    const details = meta(await execute({ operation: "metadata", pageId: page.pageId }));
    expect(details).toMatchObject({
      author: "Fixture author",
      publishedTime: "2026-09-20",
      description: "A useful description",
      canonicalUrl: "https://example.com/canonical",
      headings: [{ level: 1, text: "Visible heading" }],
      feeds: [{ title: "Feed", url: "https://example.com/feed.xml" }],
    });
    expect(details.note).toContain("source claims");
    expect(fetcher.get).toHaveBeenCalledOnce();
    const extracted = extractPage(
      '<meta name="toString" content="bad"><link rel="canonical" href="http://127.0.0.1"><a href="file:///secret">No</a><p>Text</p>',
      "text/html",
      "https://example.com",
    );
    expect(extracted.metadata.canonicalUrl).toBeUndefined();
    expect(extracted.links).toEqual([]);
  });
  it("retains independent successes in a batch and rejects private URLs before fetching", async () => {
    const { execute, fetcher } = setup();
    fetcher.get.mockRejectedValueOnce(new Error("private failure message"));
    const response = meta(
      await execute({
        operation: "read-many",
        urls: [
          "https://example.com/fails",
          "http://127.0.0.1/secret",
          "https://example.com/succeeds",
        ],
      }),
    );
    expect(response.results[0].error).toBe("This source could not be read.");
    expect(response.results[1].error).toBeTruthy();
    expect(response.results[2].text).toHaveLength(4000);
    expect(response.results[2].nextStart).toBe(4000);
    expect(fetcher.get).toHaveBeenCalledTimes(2);
    expect(
      (await execute({ operation: "page", pageId: response.results[2].pageId, start: 4000 }))
        .isError,
    ).toBeUndefined();
    expect(
      (await execute({ operation: "read-many", urls: Array(4).fill("https://example.com") }))
        .isError,
    ).toBe(true);
    expect(fetcher.get).toHaveBeenCalledTimes(2);
  });
  it("holds serialization until all cancelled batch fetches settle and suppresses their cache writes", async () => {
    vi.useFakeTimers();
    const { execute, fetcher, turn } = setup();
    let finish: (value: Awaited<ReturnType<WebFetcher["get"]>>) => void = () => {};
    fetcher.get
      .mockImplementationOnce(async (_url, signal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        signal.throwIfAborted();
        throw new Error("unreachable");
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const pending = execute({
      operation: "read-many",
      urls: ["https://example.com/a", "https://example.com/b"],
    });
    await vi.advanceTimersByTimeAsync(15000);
    expect((await pending).isError).toBe(true);
    expect((await execute({ operation: "status" })).content[0]?.text).toContain("still running");
    finish({ url: "https://example.com/b", contentType: "text/plain", body: "late" });
    await vi.advanceTimersByTimeAsync(0);
    expect((await execute({ operation: "status" })).isError).toBeUndefined();
    expect(turn.signal.aborted).toBe(false);
  });
});

describe("public feeds", () => {
  it("reads RSS through the protected fetch path and limits entries and descriptions", async () => {
    const { execute, fetcher } = setup();
    fetcher.get.mockResolvedValue({
      url: "https://example.com/feed",
      contentType: "application/rss+xml",
      body: `<rss version="2.0"><channel><title>Updates</title><link>https://example.com</link>${Array.from({ length: 22 }, (_, i) => `<item><title>Article ${i}</title><link>/article/${i}</link><description><![CDATA[<p>News</p><script>hidden code</script>]]></description><pubDate>Sun, 20 Sep 2026 12:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`,
    });
    const feed = meta(await execute({ operation: "feed", url: "https://example.com/feed" }));
    expect(feed).toMatchObject({ title: "Updates", totalItems: 22, truncated: true });
    expect(feed.items).toHaveLength(20);
    expect(feed.items[0]).toMatchObject({
      url: "https://example.com/article/0",
      description: "News",
      publishedTime: "2026-09-20T12:00:00.000Z",
    });
    expect((await execute({ operation: "feed", url: "http://127.0.0.1" })).isError).toBe(true);
    expect(fetcher.get).toHaveBeenCalledOnce();
  });
  it("handles Atom, missing or invalid dates, unsafe links and non-feed pages", () => {
    const feed = extractFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>Update</title><link href="https://example.com/post"/><updated>invalid</updated><summary>Summary</summary></entry><entry><link href="http://127.0.0.1/private"/></entry></feed>',
      "https://example.com/feed",
    );
    expect(feed.items[0]).toMatchObject({
      title: "Update",
      url: "https://example.com/post",
      description: "Summary",
    });
    expect(feed.items[0]?.publishedTime).toBeUndefined();
    expect(feed.items[1]?.url).toBeUndefined();
    expect(() => extractFeed("<html><p>Not a feed</p></html>", "https://example.com")).toThrow(
      "recognizable RSS or Atom",
    );
  });
});
