import { afterEach, describe, expect, it, vi } from "vitest";
import { readSearchKey, WebController, type WebFetcher } from "../../src/main/web/controller";
import type { WebResult } from "../../src/shared/web";

const meta = (result: WebResult) => JSON.parse(result.content[0]?.text ?? "{}");
function setup(key = "") {
  const fetcher = {
    get: vi
      .fn<WebFetcher["get"]>()
      .mockResolvedValue({
        url: "https://example.com/article",
        contentType: "text/html",
        body: `<title>Fixture</title><p>${"hello ".repeat(2000)}needle at end</p>`,
      }),
  };
  const turn = new AbortController();
  let now = 1_000_000;
  const controller = new WebController(fetcher, key, () => now);
  const execute = (request: unknown) => controller.execute(request, turn.signal);
  return {
    fetcher,
    controller,
    turn,
    execute,
    expire: () => {
      now += 300_001;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("web research service", () => {
  it("reads, pages and finds within the same snapshot without repeating network requests", async () => {
    const { execute, fetcher } = setup();
    const first = meta(await execute({ operation: "read", url: "https://example.com/article" }));
    expect(first).toMatchObject({
      title: "Fixture",
      start: 0,
      end: 8000,
      nextStart: 8000,
      sourceTruncated: false,
      url: "https://example.com/article",
    });
    const next = meta(
      await execute({ operation: "page", pageId: first.pageId, start: first.nextStart }),
    );
    expect(next.nextStart).toBeNull();
    expect(next.text).toContain("needle at end");
    const found = meta(await execute({ operation: "find", pageId: first.pageId, query: "NEEDLE" }));
    expect(found.matches).toHaveLength(1);
    expect(found.matches[0].text).toContain("needle at end");
    expect(found.retrievedAt).toBe(first.retrievedAt);
    expect(fetcher.get).toHaveBeenCalledOnce();
  });
  it("expires cached pages on time, turn end and conversation changes", async () => {
    const { execute, controller, turn, expire } = setup();
    const first = meta(await execute({ operation: "read", url: "https://example.com" }));
    expire();
    expect((await execute({ operation: "page", pageId: first.pageId, start: 0 })).isError).toBe(
      true,
    );
    const second = meta(await execute({ operation: "read", url: "https://example.com" }));
    turn.abort();
    expect(
      (
        await controller.execute(
          { operation: "find", pageId: second.pageId, query: "needle" },
          new AbortController().signal,
        )
      ).isError,
    ).toBe(true);
  });
  it("does not make a network call when optional search has no key", async () => {
    const { execute, fetcher } = setup();
    const response = await execute({ operation: "search", query: "news" });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("not configured");
    expect(fetcher.get).not.toHaveBeenCalled();
  });
  it("uses the fixed search endpoint, bounds results and keeps the key out of model output", async () => {
    const { execute, fetcher } = setup("private-key-canary");
    fetcher.get.mockResolvedValue({
      url: "https://api.search.brave.com/res/v1/web/search",
      contentType: "application/json",
      body: JSON.stringify({
        web: {
          results: [
            {
              title: "Article",
              url: "https://example.com/article",
              description: "Relevant evidence",
              age: "2 days ago",
            },
            { title: "private", url: "http://127.0.0.1" },
          ],
        },
      }),
    });
    const response = await execute({ operation: "search", query: "latest article" });
    expect(meta(response).results).toEqual([
      {
        title: "Article",
        url: "https://example.com/article",
        snippet: "Relevant evidence",
        providerDate: "2 days ago",
      },
    ]);
    expect(JSON.stringify(response)).not.toContain("private-key-canary");
    expect(fetcher.get.mock.calls[0]?.[0]).toBe(
      "https://api.search.brave.com/res/v1/web/search?q=latest+article&count=5&text_decorations=false",
    );
    expect(fetcher.get.mock.calls[0]?.[2]).toEqual({
      origin: "https://api.search.brave.com",
      headers: { "X-Subscription-Token": "private-key-canary" },
    });
  });
  it("sanitizes malformed provider results and failures", async () => {
    const { execute, fetcher } = setup("private-key-canary");
    fetcher.get
      .mockRejectedValueOnce(new Error("private-key-canary"))
      .mockResolvedValueOnce({
        url: "https://example.com",
        contentType: "application/json",
        body: "not json",
      });
    for (let i = 0; i < 2; i++) {
      const response = await execute({ operation: "search", query: "test" });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response)).not.toContain("private-key-canary");
    }
  });
  it("bounds hung fetches, suppresses late content and keeps serialization until settled", async () => {
    vi.useFakeTimers();
    const { execute, fetcher } = setup();
    let finish: (value: Awaited<ReturnType<WebFetcher["get"]>>) => void = () => {};
    fetcher.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = execute({ operation: "read", url: "https://example.com" });
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).isError).toBe(true);
    expect((await execute({ operation: "read", url: "https://example.com" })).isError).toBe(true);
    finish({ url: "https://example.com", contentType: "text/plain", body: "late private text" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher.get).toHaveBeenCalledOnce();
  });
  it("reads only the explicit search key and rejects invalid inputs before work", async () => {
    expect(readSearchKey({ BRAVE_API_KEY: "ambient", COMPUTERCAT_API_KEY: "model" })).toBe("");
    expect(readSearchKey({ COMPUTERCAT_BRAVE_SEARCH_API_KEY: "chosen" })).toBe("chosen");
    const { execute, fetcher } = setup();
    expect(
      (
        await execute({
          operation: "read",
          url: "https://example.com",
          headers: { Cookie: "ambient" },
        })
      ).isError,
    ).toBe(true);
    expect(fetcher.get).not.toHaveBeenCalled();
  });
});
