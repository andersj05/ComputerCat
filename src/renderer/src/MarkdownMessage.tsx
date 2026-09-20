import { type ReactNode, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { webUrlSchema } from "../../shared/desktop-utilities";

function MessageLink({ href, children }: { href?: string | undefined; children?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!webUrlSchema.safeParse(href).success) return <span>{children}</span>;
  return (
    <>
      <a
        href={href}
        title={href}
        rel="noreferrer"
        aria-busy={busy}
        onClick={async (event) => {
          event.preventDefault();
          if (busy || !href) return;
          setBusy(true);
          setError("");
          try {
            const result = await window.computerCat.openLink(href);
            if (!result.ok) setError(result.message);
          } catch {
            setError("Couldn't open this link. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </a>
      {error && <span role="alert"> {error}</span>}
    </>
  );
}

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown-message">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          // Explicit clicks use the validated bridge; never navigate the app.
          a: MessageLink,
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
