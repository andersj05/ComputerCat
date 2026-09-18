import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown-message">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          // Model output must not navigate the app or load remote resources.
          a: ({ children, href }) => <span title={href}>{children}</span>,
          img: ({ alt }) => <span>{alt || "Image"}</span>,
          table: ({ children }) => (
            <div className="markdown-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
