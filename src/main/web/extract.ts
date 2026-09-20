import { Parser } from "htmlparser2";
import { publicUrl, WebError } from "./public-http";

export const MAX_PAGE_TEXT = 100_000;
export interface ExtractedPage {
  title: string;
  text: string;
  links: { title: string; url: string }[];
  truncated: boolean;
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
    };
  if (mime !== "text/html" && mime !== "application/xhtml+xml")
    throw new WebError(
      "This tool reads HTML, plain text, Markdown and JSON pages. PDFs, images and other downloads are unsupported.",
    );
  let text = "";
  let title = "";
  let inTitle = false;
  let truncated = false;
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
        if (name === "title") inTitle = true;
        if (blocks.has(name)) append("\n");
        if (name === "td" || name === "th") append("\t");
        if (name === "a" && attrs.href && links.length < 20) {
          try {
            const href = publicUrl(new URL(attrs.href, url).href).href;
            if (href.length <= 2048) anchor = { title: "", url: href };
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
      },
      onclosetag(name) {
        const skip = hidden.pop();
        if (skip) return;
        if (name === "title") inTitle = false;
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
  return { title: title.trim() || url, text, links, truncated };
}
