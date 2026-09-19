# Harness guide

Reviewed: 2026-09-19.

**Options → Harness guide → Open harness guide in browser** opens an offline XP-themed
reference. The clickable map explains the companion, Pi/model loop, desktop broker, providers,
file/shell branch and saved context. Examples trace screen, selection, detail, file and voice
questions without executing them. The catalog searches all registered tools; the remaining
pages explain extension points, context retention and current limits.

## Keep the guide with the implementation

- [Tool descriptions](../src/guide/catalog.ts) form an exhaustive typed record of
  [registered names](../src/shared/tools.ts). A new or removed name requires updating the catalog.
- [Page content](../src/guide/index.html), [interactions](../src/guide/interactions.js) and
  [styles](../src/guide/style.css) own the map, examples and extension guidance. Review these
  when behavior changes, alongside architecture and desktop-context documentation.
- The [build plugin](../src/guide/build.ts) embeds the catalog, shared XP colors, script,
  styles and cat artwork into `out/main/harness-guide.html`. No server, CDN, module loading,
  model connection or browser extension is needed. Restart development after catalog changes;
  a production build always includes the current catalog.
- The document's content policy allows its exact script/style hashes and embedded image,
  and denies network access. It contains no conversation data, credentials or preload bridge.
- The [opener](../src/main/harness-guide.ts) copies only the bundled document to app user
  data's `help/harness-guide.html` before using the OS HTML-file association. This also works
  when the source is inside `app.asar`. Each open refreshes the copy. The chat-only IPC accepts
  no path or URL. Launch failures preserve the Options draft and offer retry.

The page describes capabilities in the installed build, not live status. Desktop observation
and file/shell execution have different scopes; keep that distinction visible in the diagram.
Future capabilities must remain labeled unimplemented until their actual tools exist.

See [architecture](architecture.md), [desktop context](desktop-context.md),
[XP presentation](windows-xp-design.md) and [opener checks](../tests/unit/harness-guide.test.ts).
