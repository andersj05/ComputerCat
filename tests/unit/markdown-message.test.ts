import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "../../src/renderer/src/MarkdownMessage";

const render = (text: string) => renderToStaticMarkup(createElement(MarkdownMessage, { text }));

describe("assistant Markdown", () => {
  it("renders common model formatting as semantic content", () => {
    const html = render(
      "## Plan\n\n**Bold** and *emphasis*\n\n- First\n- Second\n\n1. Step\n2. Next\n\n> Quote\n\n`inline`\n\n```js\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| One | Two |\n\n- [x] Done",
    );
    for (const tag of [
      "h2",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "table",
      "th",
      "td",
    ]) {
      expect(html).toContain(`<${tag}`);
    }
    expect(html).toContain("disabled");
  });

  it("keeps HTML and remote images inactive and only exposes HTTP links", () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src="https://example.com/tracker" onerror="alert(1)">\n\n![Picture](https://example.com/image)\n\n[Unsafe](javascript:alert%281%29) and [Website](https://example.com)',
    );
    expect(html).not.toMatch(/<(script|img)\b/);
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
    expect(html).toContain("Picture");
    expect(html).toContain("Website");
  });

  it("keeps custom protocols, credentialed and relative links inactive", () => {
    for (const href of [
      "file:///C:/secret",
      "mailto:cat@example.com",
      "https://user:pass@example.com",
      "/relative",
      `https://example.com/${"a".repeat(2082)}`,
    ])
      expect(render(`[Link](${href})`)).not.toContain("<a ");
  });

  it("accepts partial streaming Markdown and preserves code literally", () => {
    expect(render("**An unfinished")).toContain("An unfinished");
    expect(render("```html\n<img src=x>\n")).toContain("&lt;img src=x&gt;");
    expect(render("**Completed**")).toContain("<strong>Completed</strong>");
  });
});
