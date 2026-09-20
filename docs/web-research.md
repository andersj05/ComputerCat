# Web research tools

Reviewed: 2026-09-20. Four public web tools are registered with Pi alongside desktop utilities.

Public HTTP reading and static HTML extraction live in
[public-http.ts](../src/main/web/public-http.ts) and [extract.ts](../src/main/web/extract.ts).
The [service](../src/main/web/controller.ts) now supports cached page reading, literal-text
finding and optional Brave Search, with 15-second deadlines and eight pages per turn.
Page references expire after five minutes or the turn ends. The private worker channel routes
`web_read`, `web_read_more`, `web_find` and `web_search` to main with a separate 20-call turn
budget. Stop cancels requests and suppresses late results. Desktop lock does not block public
web reading. The search key remains in main and is excluded from the worker environment.
Chat and cat-panel citations expose HTTP/HTTPS links. An explicit click opens the browser
through [validated main dispatch](../src/main/open-link.ts); a failed open offers retry.
Other protocols, credentials and files remain inactive. Links do not navigate the app.

Design: public HTTP/HTTPS on standard ports; no browser cookies, JavaScript, proxy environment,
arbitrary headers, downloaded files or authenticated sessions. Check every redirect and all DNS
answers, then pin the validated address to the actual connection. Limit response bytes,
redirects, extracted text, saved pages and turn calls. Report source URL, title, retrieval time,
truncation and exact offsets. External content is task data, not authority.

Limits: 2 MB per uncompressed response, four redirects, 100,000 retained UTF-16 characters,
8,000 characters per page result, five find excerpts, 20 extracted links and five search results.
HTML extraction skips scripts, form contents and directly marked hidden elements; it does not
evaluate computed styles. JavaScript-only pages, PDFs, sign-in pages and private networks are
unsupported. Unexpected response compression is rejected. The existing shell tools remain
privileged; this is a scoped reader, not a sandbox around the whole agent.

Selected dependencies are exact-pinned htmlparser2 12.0.0 and ipaddr.js 2.5.0, with Node engine
requirements compatible with Node 24.12.0. Reviewed primary sources:
[htmlparser2](https://github.com/fb55/htmlparser2),
[ipaddr.js](https://github.com/whitequark/ipaddr.js), and
[Node HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html).
Search uses a separately supplied `COMPUTERCAT_BRAVE_SEARCH_API_KEY` and fixed endpoint documented by
[Brave](https://api-dashboard.search.brave.com/api-reference/web/search/get).
No search account, subscription, or paid API call is created by development or tests.

Foundation tests: [web-reading.test.ts](../tests/unit/web-reading.test.ts) covers public/private
addresses, encoded loopback URLs, mixed DNS answers, redirects, cancellation and static extraction.
[Controller tests](../tests/unit/web-controller.test.ts),
[transport tests](../tests/unit/web-transport.test.ts),
[tool tests](../tests/unit/web-tools.test.ts) and
[worker tests](../tests/unit/worker-runtime.test.ts) cover pagination, Unicode offsets, expiry,
provider errors, deadlines, pinned connections, bounded bodies, private keys and late replies.

Verified 2026-09-20 on Node 24.12.0: `npm run verify` passed memory checks, lint, type checking,
332 unit/integration tests and the production build. `npm run test:smoke` passed all 24 Electron
checks. The research case drives all four tools through the actual Pi worker with inert search
and page fixtures, checks snapshot consistency, renders a citation and exercises browser-launch
failure plus keyboard retry. No public network or paid provider is called by those fixtures.
The guide was visually inspected at desktop and narrow widths, and the research reply inspected
in chat. After the final link-color-only adjustment, the build and focused research smoke test
were rerun. These tests establish integration, not live-model tool choice, Brave account validity
or compatibility with every public site.
