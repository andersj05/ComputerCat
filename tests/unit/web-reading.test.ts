import { describe, expect, it, vi } from "vitest";
import { extractPage, MAX_PAGE_TEXT } from "../../src/main/web/extract";
import {
  type HttpTransport,
  PublicHttp,
  publicAddress,
  publicUrl,
} from "../../src/main/web/public-http";

describe("public web destination policy", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "240.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::",
    "2001:db8::1",
    "64:ff9b::7f00:1",
    "3fff::1",
  ])("blocks nonpublic address %s", (address) => {
    expect(publicAddress(address)).toBe(false);
  });
  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])(
    "allows global address %s",
    (address) => {
      expect(publicAddress(address)).toBe(true);
    },
  );
  it.each([
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://[::ffff:127.0.0.1]/",
    "https://localhost./",
    "http://router/",
    "https://x.internal/",
    "https://x.local/",
    "http://example.com:8080/",
    "https://user:password@example.com/",
    "file:///private",
    "javascript:alert(1)",
    "https://example.com\\test",
  ])("rejects URL %s", (url) => {
    expect(() => publicUrl(url)).toThrow();
  });
  it("removes fragments and supports explicit standard ports", () => {
    expect(publicUrl("https://example.com:443/path#fragment").href).toBe(
      "https://example.com/path",
    );
  });
  it("checks all DNS answers, pins the connection address, and checks redirects again", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]);
    const transport = vi
      .fn<HttpTransport>()
      .mockResolvedValue({
        status: 302,
        location: "https://other.example.com/page",
        contentType: "text/html",
        body: "",
      });
    const reader = new PublicHttp(resolve, transport);
    await expect(reader.get("https://example.com", new AbortController().signal)).rejects.toThrow(
      "private network",
    );
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[1]).toEqual({ address: "93.184.216.34", family: 4 });
    expect(transport.mock.calls[0]?.[3]).toEqual({});
  });
  it.each(["http://127.0.0.1", "http://example.com", "file:///private"])(
    "does not follow unsafe redirect %s",
    async (location) => {
      const transport = vi
        .fn<HttpTransport>()
        .mockResolvedValue({ status: 302, location, contentType: "", body: "" });
      const reader = new PublicHttp(
        async () => [{ address: "93.184.216.34", family: 4 }],
        transport,
      );
      await expect(
        reader.get("https://example.com", new AbortController().signal),
      ).rejects.toThrow();
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("never follows redirects on authenticated provider requests", async () => {
    const transport = vi
      .fn<HttpTransport>()
      .mockResolvedValue({ status: 302, location: "/redirect", contentType: "", body: "" });
    const reader = new PublicHttp(async () => [{ address: "93.184.216.34", family: 4 }], transport);
    await expect(
      reader.get("https://example.com/search", new AbortController().signal, {
        origin: "https://example.com",
        headers: { "X-Subscription-Token": "fixture" },
      }),
    ).rejects.toThrow("unexpected redirect");
    expect(transport).toHaveBeenCalledOnce();
  });
  it("does not start a request after cancellation during DNS", async () => {
    const abort = new AbortController();
    const transport = vi.fn<HttpTransport>();
    const reader = new PublicHttp(async () => {
      abort.abort();
      return [{ address: "93.184.216.34", family: 4 }];
    }, transport);
    await expect(reader.get("https://example.com", abort.signal)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("reports HTTP errors without including private response bodies", async () => {
    const reader = new PublicHttp(
      async () => [{ address: "93.184.216.34", family: 4 }],
      async () => ({ status: 401, contentType: "text/html", body: "private server error" }),
    );
    await expect(reader.get("https://example.com", new AbortController().signal)).rejects.toThrow(
      "HTTP 401",
    );
  });
});

describe("static page extraction", () => {
  it("extracts readable text, title and safe resolved links without executing or exposing form/script content", () => {
    const page = extractPage(
      '<html><head><title>A &amp; B</title><script>private script</script></head><body><h1>Hello</h1><p>Useful &lt;text&gt; <a href="/guide">Guide</a>.</p><form><input value="secret"><textarea>secret form</textarea></form><div hidden>hidden text</div><div aria-hidden="true">hidden label</div><style>private CSS</style><a href="javascript:alert(1)">bad link</a></body></html>',
      "text/html; charset=utf-8",
      "https://example.com/base",
    );
    expect(page.title).toBe("A & B");
    expect(page.text).toContain("Useful <text> Guide.");
    expect(page.text).toMatch(/^Hello\n/);
    expect(page.text).not.toMatch(/secret|hidden|private/);
    expect(page.links).toEqual([{ title: "Guide", url: "https://example.com/guide" }]);
    expect(page.truncated).toBe(false);
  });
  it("bounds extraction and keeps plain text whitespace", () => {
    const text = " \n fixture\t ";
    expect(extractPage(text, "text/plain", "https://example.com").text).toBe(text);
    const page = extractPage(
      `<p>${"x".repeat(MAX_PAGE_TEXT + 50)}</p>`,
      "text/html",
      "https://example.com",
    );
    expect(page.text.length).toBeLessThanOrEqual(MAX_PAGE_TEXT);
    expect(page.truncated).toBe(true);
  });
  it("reports script-only pages and unsupported documents honestly", () => {
    expect(() =>
      extractPage("<script>render()</script>", "text/html", "https://example.com"),
    ).toThrow("no readable static text");
    expect(() => extractPage("pdf", "application/pdf", "https://example.com")).toThrow(
      "unsupported",
    );
  });
});
