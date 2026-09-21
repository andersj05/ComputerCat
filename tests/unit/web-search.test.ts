import { describe, expect, it, vi } from "vitest";
import { WebController, type WebFetcher } from "../../src/main/web/controller";
import { parseSearchHtml } from "../../src/main/web/search";

const html = `<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fprofile">A public profile</a><span class="result__snippet">Public &amp; useful</span></div>`;
const document = (body = html) => ({
  url: "https://html.duckduckgo.com/html/",
  contentType: "text/html",
  body,
});
const meta = (value: { content: { text: string }[] }) => JSON.parse(value.content[0]?.text ?? "{}");

describe("search recovery", () => {
  it("reads keyless results, unwraps source links and discards unsafe destinations", async () => {
    const fetcher = { get: vi.fn<WebFetcher["get"]>().mockResolvedValue(document()) };
    const browser = vi.fn();
    const response = await new WebController(fetcher, "", Date.now, browser).execute(
      { operation: "search", query: "Example account site:x.com" },
      new AbortController().signal,
    );
    expect(meta(response)).toMatchObject({
      status: "results",
      provider: "DuckDuckGo HTML",
      results: [
        {
          title: "A public profile",
          url: "https://example.com/profile",
          snippet: "Public & useful",
        },
      ],
    });
    expect(fetcher.get.mock.calls[0]?.[2]).toBeUndefined();
    expect(browser).not.toHaveBeenCalled();
    expect(
      parseSearchHtml(
        html + html.replace("https%3A%2F%2Fexample.com%2Fprofile", "http%3A%2F%2F127.0.0.1"),
      ),
    ).toHaveLength(1);
  });
  it("recovers from a rejected API key without forwarding it to the keyless provider", async () => {
    const fetcher = {
      get: vi
        .fn<WebFetcher["get"]>()
        .mockRejectedValueOnce(new Error("secret-canary"))
        .mockResolvedValueOnce(document()),
    };
    const response = await new WebController(fetcher, "secret-canary").execute(
      { operation: "search", query: "test" },
      new AbortController().signal,
    );
    expect(meta(response).status).toBe("results");
    expect(fetcher.get.mock.calls[1]?.[2]).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain("secret-canary");
  });
  it("dispatches browser recovery for a challenge without fabricating search evidence", async () => {
    const fetcher = {
      get: vi
        .fn<WebFetcher["get"]>()
        .mockResolvedValue(document(`<form id="challenge-form">Solve me</form>${html}`)),
    };
    const browser = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "dispatched" }] });
    const response = await new WebController(fetcher, "", Date.now, browser).execute(
      { operation: "search", query: "known account" },
      new AbortController().signal,
    );
    expect(browser).toHaveBeenCalledWith("known account", expect.any(AbortSignal));
    expect(meta(response)).toMatchObject({ status: "browser-opened", nextTool: "desktop_observe" });
    expect(meta(response).results).toBeUndefined();
  });
  it("distinguishes empty results from a blocked response", () => {
    expect(parseSearchHtml('<div class="no-results">No results found.</div>')).toEqual([]);
    expect(() => parseSearchHtml("<p>Please sign in</p>")).toThrow("no recognizable results");
  });
  it("reports a blocked browser and never dispatches after cancellation", async () => {
    const abort = new AbortController();
    const fetcher = { get: vi.fn<WebFetcher["get"]>().mockRejectedValue(new Error("offline")) };
    const browser = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "locked" }], isError: true });
    const controller = new WebController(fetcher, "", Date.now, browser);
    expect(
      (await controller.execute({ operation: "search", query: "test" }, abort.signal)).isError,
    ).toBe(true);
    browser.mockClear();
    fetcher.get.mockImplementation(async () => {
      abort.abort();
      throw new Error("stopped");
    });
    expect(
      (await controller.execute({ operation: "search", query: "test" }, abort.signal)).isError,
    ).toBe(true);
    expect(browser).not.toHaveBeenCalled();
  });
});
