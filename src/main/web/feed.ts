import { parseFeed } from "htmlparser2";
import { extractPage } from "./extract";
import { publicUrl, WebError } from "./public-http";

export function extractFeed(body: string, url: string) {
  const feed = parseFeed(body);
  if (!feed)
    throw new WebError(
      "This URL did not return a recognizable RSS or Atom feed. Use web_read for a normal page.",
    );
  const text = (value: string | undefined, max: number) => {
    if (!value) return "";
    try {
      return extractPage(value, "text/html", url).text.slice(0, max);
    } catch {
      return "";
    }
  };
  const link = (value: string | undefined) => {
    if (!value) return undefined;
    try {
      const target = publicUrl(new URL(value, url).href).href;
      return target.length <= 2048 ? target : undefined;
    } catch {
      return undefined;
    }
  };
  const date = (value: Date | undefined) =>
    value && Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  return {
    type: feed.type,
    title: text(feed.title, 300),
    description: text(feed.description, 1000),
    siteUrl: link(feed.link),
    author: text(feed.author, 300),
    updated: date(feed.updated),
    totalItems: feed.items.length,
    truncated: feed.items.length > 20,
    items: feed.items
      .slice(0, 20)
      .map((item) => ({
        title: text(item.title, 300),
        url: link(item.link),
        description: text(item.description, 1500),
        publishedTime: date(item.pubDate),
      })),
  };
}
