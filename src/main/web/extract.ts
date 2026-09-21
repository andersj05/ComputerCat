import { Parser } from "htmlparser2";
import { publicUrl, WebError } from "./public-http";

export const MAX_PAGE_TEXT = 100_000;
export interface PageMetadata {
  description?: string;
  author?: string;
  siteName?: string;
  canonicalUrl?: string;
  publishedTime?: string;
  modifiedTime?: string;
  headings: { level: number; text: string }[];
  feeds: { title: string; url: string }[];
}
const metaFields: Record<
  string,
  Exclude<keyof PageMetadata, "canonicalUrl" | "headings" | "feeds">
> = {
  description: "description",
  "og:description": "description",
  author: "author",
  "og:site_name": "siteName",
  "article:published_time": "publishedTime",
  "article:modified_time": "modifiedTime",
};
export interface ExtractedPage {
  title: string;
  text: string;
  links: { title: string; url: string }[];
  truncated: boolean;
  linksTruncated: boolean;
  metadata: PageMetadata;
}
const hiddenTags = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "form",
  "input",
  "textarea",
  "select",
]);
const blocks = new Set([
  "p",
  "div",
  "article",
  "section",
  "main",
  "header",
  "footer",
  "nav",
  "aside",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "br",
  "tr",
  "pre",
  "blockquote",
]);

export function extractPage(body: string, contentType: string, url: string): ExtractedPage {
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  if (mime === "text/plain" || mime === "text/markdown" || mime === "application/json")
    return {
      title: url,
      text: body.slice(0, MAX_PAGE_TEXT),
      links: [],
      truncated: body.length > MAX_PAGE_TEXT,
      linksTruncated: false,
      metadata: { headings: [], feeds: [] },
    };
  if (mime !== "text/html" && mime !== "application/xhtml+xml")
    throw new WebError(
      "This tool reads HTML, plain text, Markdown and JSON pages. PDFs, images and other downloads are unsupported.",
    );
  let text = "";
  let title = "";
  let inTitle = false;
  let truncated = false;
  let linksTruncated = false;
  const metadata: PageMetadata = { headings: [], feeds: [] };
  let heading: { level: number; text: string } | undefined;
  const hidden: boolean[] = [];
  let anchor: { title: string; url: string } | undefined;
  const links: { title: string; url: string }[] = [];
  const append = (value: string) => {
    if (text.length + value.length > MAX_PAGE_TEXT) truncated = true;
    text += value.slice(0, Math.max(0, MAX_PAGE_TEXT - text.length));
  };
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const skip =
          Boolean(hidden.at(-1)) ||
          hiddenTags.has(name) ||
          "hidden" in attrs ||
          attrs["aria-hidden"] === "true" ||
          /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style ?? "");
        hidden.push(skip);
        if (skip) return;
        if (name === "meta" && attrs.content) {
          const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
          const field = Object.hasOwn(metaFields, key) ? metaFields[key] : undefined;
          if (field && !metadata[field])
            metadata[field] = attrs.content.slice(0, field === "description" ? 1000 : 300);
        }
        if (name === "link" && attrs.href) {
          try {
            const href = publicUrl(new URL(attrs.href, url).href).href;
            if (href.length <= 2048) {
              const rel = attrs.rel?.toLowerCase().split(/\s+/) ?? [];
              if (rel.includes("canonical") && !metadata.canonicalUrl) metadata.canonicalUrl = href;
              if (
                rel.includes("alternate") &&
                /^(application\/(rss|atom)\+xml)$/i.test(attrs.type ?? "") &&
                metadata.feeds.length < 5
              )
                metadata.feeds.push({ title: (attrs.title ?? "Feed").slice(0, 200), url: href });
            }
          } catch {
            /* Ignore unsupported metadata URLs. */
          }
        }
        if (/^h[1-6]$/.test(name) && metadata.headings.length < 40)
          heading = { level: Number(name[1]), text: "" };
        if (name === "title") inTitle = true;
        if (blocks.has(name)) append("\n");
        if (name === "td" || name === "th") append("\t");
        if (name === "a" && attrs.href) {
          try {
            const href = publicUrl(new URL(attrs.href, url).href).href;
            if (href.length <= 2048) {
              if (links.length < 200) anchor = { title: "", url: href };
              else linksTruncated = true;
            }
          } catch {
            /* Ignore non-web links. */
          }
        }
      },
      ontext(value) {
        if (hidden.at(-1)) return;
        const normalized = value.replace(/\s+/g, " ");
        if (inTitle) title = (title + normalized).slice(0, 512);
        else append(normalized);
        if (anchor) anchor.title = (anchor.title + normalized).slice(0, 120);
        if (heading) heading.text = (heading.text + normalized).slice(0, 200);
      },
      onclosetag(name) {
        const skip = hidden.pop();
        if (skip) return;
        if (name === "title") inTitle = false;
        if (/^h[1-6]$/.test(name) && heading) {
          if (heading.text.trim())
            metadata.headings.push({ ...heading, text: heading.text.trim() });
          heading = undefined;
        }
        if (name === "a" && anchor) {
          if (!links.some((link) => link.url === anchor?.url)) links.push(anchor);
          anchor = undefined;
        }
        if (blocks.has(name)) append("\n");
      },
    },
    { decodeEntities: true },
  );
  parser.end(body);
  text = text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text)
    throw new WebError(
      "The page has no readable static text. It may need JavaScript or sign-in; no browser session was accessed.",
    );
  return { title: title.trim() || url, text, links, truncated, linksTruncated, metadata };
}
