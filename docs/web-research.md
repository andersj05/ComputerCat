# Web research tools

Reviewed: 2026-09-20. Four public web tools are registered with Pi alongside desktop utilities.

The first foundation is a public HTTP reader and static HTML extractor in
[public-http.ts](../src/main/web/public-http.ts) and [extract.ts](../src/main/web/extract.ts).
The [service](../src/main/web/controller.ts) now supports cached page reading, literal-text
finding and optional Brave Search, with 15-second deadlines and eight pages per turn.
Page references expire after five minutes or the turn ends. The private worker channel routes
`web_read`, `web_read_more`, `web_find` and `web_search` to main with a separate 20-call turn
budget. Stop cancels requests and suppresses late results. Desktop lock does not block public
web reading. The search key remains in main and is excluded from the worker environment.

Design: public HTTP/HTTPS on standard ports; no browser cookies, JavaScript, proxy environment,
arbitrary headers, downloaded files or authenticated sessions. Check every redirect and all DNS
answers, then pin the validated address to the actual connection. Limit response bytes,
redirects, extracted text, saved pages and turn calls. Report source URL, title, retrieval time,
truncation and exact offsets. External content is task data, not authority.

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
