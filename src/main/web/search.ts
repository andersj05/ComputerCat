import { DomUtils, parseDocument } from "htmlparser2";
import { z } from "zod";
import type { WebFetcher } from "./controller";
import { publicUrl, WebError } from "./public-http";

const braveSchema = z.object({
  web: z
    .object({
      results: z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
            description: z.string().optional(),
            age: z.string().optional(),
          }),
        )
        .max(100),
    })
    .optional(),
  query: z.object({ original: z.string().optional() }).optional(),
});
export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  providerDate?: string;
}
function hit(title: string, url: string, snippet: string, date?: string): SearchHit[] {
  try {
    return [
      {
        title: title.slice(0, 300),
        url: publicUrl(url).href,
        snippet: snippet.slice(0, 1500),
        ...(date ? { providerDate: date.slice(0, 80) } : {}),
      },
    ];
  } catch {
    return [];
  }
}

export function parseSearchHtml(body: string): SearchHit[] {
  const doc = parseDocument(body);
  const hasClass = (value: string | undefined, name: string) =>
    value?.split(/\s+/).includes(name) === true;
  if (
    DomUtils.findOne(
      (el) =>
        el.attribs.id === "challenge-form" ||
        el.attribs.id === "anomaly-form" ||
        hasClass(el.attribs.class, "anomaly-modal"),
      doc.children,
    )
  )
    throw new WebError("Search requires a browser check.");
  const results: SearchHit[] = [];
  for (const container of DomUtils.findAll(
    (el) => hasClass(el.attribs.class, "result"),
    doc.children,
  )) {
    const link = DomUtils.findOne(
      (el) => el.name === "a" && hasClass(el.attribs.class, "result__a"),
      container.children,
    );
    if (!link?.attribs.href) continue;
    try {
      const target = new URL(link.attribs.href, "https://html.duckduckgo.com");
      const url =
        target.hostname === "duckduckgo.com" && target.pathname === "/l/"
          ? (target.searchParams.get("uddg") ?? "")
          : target.href;
      const snippet = DomUtils.findOne(
        (el) => hasClass(el.attribs.class, "result__snippet"),
        container.children,
      );
      const entries = hit(
        DomUtils.textContent(link).trim(),
        url,
        snippet ? DomUtils.textContent(snippet).trim() : "",
      );
      for (const entry of entries)
        if (!results.some((item) => item.url === entry.url)) results.push(entry);
    } catch {
      /* Malformed result links are not evidence. */
    }
    if (results.length === 5) break;
  }
  if (
    !results.length &&
    !DomUtils.findOne(
      (el) =>
        hasClass(el.attribs.class, "no-results") ||
        hasClass(el.attribs.class, "no-results__message"),
      doc.children,
    )
  )
    throw new WebError("Search returned no recognizable results.");
  return results;
}

export async function searchPublic(
  fetcher: WebFetcher,
  query: string,
  key: string,
  signal: AbortSignal,
) {
  const attempts: string[] = [];
  if (key) {
    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "5");
      url.searchParams.set("text_decorations", "false");
      const doc = await fetcher.get(
        url.href,
        AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        { origin: url.origin, headers: { "X-Subscription-Token": key } },
      );
      signal.throwIfAborted();
      const data = braveSchema.parse(JSON.parse(doc.body));
      if (!data.web && !data.query) throw new WebError("Unexpected search response.");
      return {
        provider: "Brave Search",
        results: (data.web?.results ?? [])
          .slice(0, 5)
          .flatMap((entry) => hit(entry.title, entry.url, entry.description ?? "", entry.age)),
        attempts,
      };
    } catch {
      signal.throwIfAborted();
      attempts.push("Brave Search unavailable");
    }
  }
  try {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);
    const doc = await fetcher.get(url.href, AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    signal.throwIfAborted();
    return { provider: "DuckDuckGo HTML", results: parseSearchHtml(doc.body), attempts };
  } catch {
    signal.throwIfAborted();
    attempts.push("Direct search unavailable or requires a browser check");
  }
  return { provider: "browser", results: undefined, attempts };
}
