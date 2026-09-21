# Web research tools

Reviewed: 2026-09-20. Ten public web tools are registered with Pi alongside desktop utilities.

Public HTTP reading and static HTML extraction live in
[public-http.ts](../src/main/web/public-http.ts) and [extract.ts](../src/main/web/extract.ts).
The [service](../src/main/web/controller.ts) now supports cached page reading, literal-text
finding and public search, with 15-second deadlines and eight pages per turn.
Page references expire after five minutes or the turn ends. The private worker channel routes
`web_read`, `web_read_more`, `web_find`, `web_search`, `web_get_status`, `web_read_many`,
`web_list_links`, `web_follow_link`, `web_read_metadata` and `web_read_feed` to main with a separate 20-call turn
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

The six expanded source tools report configuration without keys, read up to three sources with
independent results (4,000 characters and five links each), page/filter cached links using stable
indexes, follow an observed link through the same public transport, inspect source metadata,
and parse RSS/Atom. Metadata includes up to 40 visible headings and five feed links; dates and
authors remain source claims. Feeds return up to 20 entries with 1,500-character descriptions.
Batch requests retain serialization until every child settles, including after cancellation.
The renderer displays a named pixel icon for each tool; tool arguments/results remain in Pi
context rather than activity labels.

Limits: 2 MB per uncompressed response, four redirects, 100,000 retained UTF-16 characters,
8,000 characters per page result, five find excerpts, 200 retained links (20 per result) and five search results.
HTML extraction skips scripts, form contents and directly marked hidden elements; it does not
evaluate computed styles. JavaScript-only pages, PDFs, sign-in pages and private networks are
unsupported. Unexpected response compression is rejected. The existing shell tools remain
privileged; this is a scoped reader, not a sandbox around the whole agent.

Selected dependencies are exact-pinned htmlparser2 12.0.0 and ipaddr.js 2.5.0, with Node engine
requirements compatible with Node 24.12.0. Reviewed primary sources:
[htmlparser2](https://github.com/fb55/htmlparser2),
[ipaddr.js](https://github.com/whitequark/ipaddr.js), and
[Node HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html).
Search first uses Brave when `COMPUTERCAT_BRAVE_SEARCH_API_KEY` is supplied, then tries the
[DuckDuckGo HTML interface](https://duckduckgo.com/duckduckgo-help-pages/features/non-javascript)
without a key. Each direct provider has a five-second deadline. Failed responses and browser
challenges trigger a Google search in the default browser through the existing desktop broker.
This action respects desktop lock/sleep and cancellation; it changes browser focus. A
`browser-opened` result is dispatch only: the agent must observe and verify the query and actual
results before answering. It must not bypass CAPTCHA or sign-in. Explicit `desktop_search_browser`
offers the same fallback. The Brave key stays at its
[fixed endpoint](https://api-dashboard.search.brave.com/api-reference/web/search/get), never in fallback requests.
The direct HTML provider can challenge automated requests (observed in a public probe on
2026-09-20); browser recovery is therefore part of the feature, not a guaranteed silent API.
No search account, subscription, or paid API call is created by development or tests.

Foundation tests: [web-reading.test.ts](../tests/unit/web-reading.test.ts) covers public/private
addresses, encoded loopback URLs, mixed DNS answers, redirects, cancellation and static extraction.
[Controller tests](../tests/unit/web-controller.test.ts),
[transport tests](../tests/unit/web-transport.test.ts),
[tool tests](../tests/unit/web-tools.test.ts), [search recovery tests](../tests/unit/web-search.test.ts),
[source research tests](../tests/unit/web-research.test.ts) and
[worker tests](../tests/unit/worker-runtime.test.ts) cover pagination, Unicode offsets, expiry,
provider errors, deadlines, pinned connections, bounded bodies, private keys and late replies.

Verified 2026-09-20 on Node 24.12.0: `npm run verify` passed memory checks, lint, type checking,
358 unit/integration tests and the production build. `npm run test:smoke` passed all 29 Electron
checks. The research case drives all ten web tools through the actual Pi worker with a keyless
search fixture, compares sources with a partial failure, follows a discovered link, reads metadata
and a feed, and checks cached pagination. It also exercises a search challenge, browser dispatch
and a subsequent desktop observation. Browser/clipboard adapters and model responses are inert;
these fixtures make no public or paid requests. Citation failure and keyboard retry remain covered.
The guide was visually inspected at narrow width and expanded tool activity inspected in chat.

A separate credential-free public probe reached the browser-recovery callback (intercepted so no
browser opened) and read ten entries from a public RSS feed. This establishes transport/parser
behavior, not live-model tool choice, Brave account validity or universal search/site availability.
