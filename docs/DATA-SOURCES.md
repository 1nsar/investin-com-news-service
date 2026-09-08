# Extra data sources — what we checked

We reviewed **Bloomberg** for news, and **Polymarket**, **Kalshi** and
**ForecastEx** for event probabilities. The expanded Polymarket review now
separates the US and international services. **Polymarket US works technically
for a read-only integration; company usage rights and employee access controls
remain to be resolved.** ForecastEx remains another candidate to evaluate.
Other provider sections retain the earlier review.

## Bloomberg — no

Bloomberg has the best data. **The blocker is their contract, not the price.**

Their licence, which we read directly, forbids storing their data in a database,
sending it to anyone else, using it in an automated system, or connecting from a
machine not logged into a Terminal. Our service does all four. A seat costs
**$31,980/year**, and buying one wouldn't help — the restrictions come with it.

They sell feeds needing no Terminal, but those are for desks to trade on, not to
show readers. The one product that *allows* republishing is a separate media
business selling by topic ("Technology", "Energy"), not by company — so even with
money, it can't answer "news about this company."

This won't change: their licence bars anything that could cost them a Terminal
subscription.

## Polymarket — US integration is feasible; company usage rights remain unresolved

**Review updated: 8 September 2026.** The proposed use is an employee-only
analytics panel beside our news feed, with no trading. **Polymarket US and
international Polymarket are separate products:** their APIs, accounts, markets
and legal routes must be assessed separately. A US account does not provide the
international Gamma/CLOB catalogue. This review tested public US endpoints and
examined our source code; it did not implement an integration, inspect private
account credentials or test authenticated streaming.

### 1. What we verified on Polymarket US

Direct requests from this machine succeeded **without a VPN, login or API key**.
This corrects the earlier network conclusion for the US service; deployment-server
connectivity still needs its own check.

| Read-only check | Observed result on 8 September |
| --- | --- |
| `GET /v1/markets?limit=3&active=true&closed=false` | HTTP 200; three active sports contracts with metadata and quotes |
| `GET /v1/markets/{slug}/bbo` and `/book` | HTTP 200; bid/ask prices, quantities and market statistics |
| `GET /v1/search?query=Fed&limit=3` | September and October Fed decisions, plus a 2026 rate-hike event, marked active/open |
| Search for interest rates | Brazil, Mexico and Japan central-bank decision events; a Mexican contract also returned a nonempty book |
| `GET /v1/price-history` for one sports contract | HTTP 200; the one-hour window was empty and the one-day window contained one sample |

The base is `https://gateway.polymarket.us`. These are small connectivity and
schema checks, **not a liquidity survey or a production reliability test**.
A general introduction still described finance as forthcoming, but the live API
already listed macro markets. Conversely, a search for inflation returned no
results; that alone does not prove the entire catalogue lacks inflation markets.
[Public API](https://docs.polymarket.us/api-reference/introduction),
[market listings](https://docs.polymarket.us/api-reference/markets/get-markets),
[search](https://docs.polymarket.us/api-reference/search/search).

### 2. Connection options and freshness

| Route | Data and access | Fit for our platform |
| --- | --- | --- |
| Public REST: `gateway.polymarket.us` | Markets/events, search, quotes, books, settlement and history; no key | Simplest first pilot if our corporate use is confirmed |
| Retail market WebSocket: `wss://api.polymarket.us/v1/ws/markets` | API-key authentication; real-time books, prices and trades | Later option if polling is too slow and this account route is approved for us |
| Direct Exchange data access | Read-only REST/gRPC for reference data, BBO, depth and statistics; provisioned credentials | Explicitly documented route for research teams and analytics platforms |

The public API documents **20 requests/second/IP**. REST gives a snapshot per
request; polling every 30 seconds does not capture every intervening change.
The retail WebSocket supports up to 100 markets per subscription and optional
batching. Neither a successful request nor the phrase real time establishes a
latency guarantee. We have not measured the authenticated stream.
[Public limits](https://docs.polymarket.us/api-reference/rate-limits),
[WebSocket](https://docs.polymarket.us/api-reference/websocket/markets),
[data guide](https://docs.polymarket.us/data-guide/overview).

Retail keys require app signup and identity verification before developer-portal
key generation; the retail route is described as personal accounts only. This
requirement does not apply to anonymous public REST. Institutional data-only
streaming uses separate credentials/scopes and says trading KYC and a participant
ID are unnecessary; contractual onboarding still applies. Personal login is
therefore neither necessary for public reads nor sufficient evidence of company
entitlement.
[Retail authentication](https://docs.polymarket.us/api-reference/authentication),
[API types](https://docs.polymarket.us/trader-guide/api-overview),
[institutional streaming](https://docs.polymarket.us/streaming-endpoints/market-data-stream).

Institutional limits differ materially: book/BBO reads are documented at
12/minute/firm, with streaming available for frequent updates. **Do not reuse the
public REST polling budget for an institutional connection.**
[Exchange limits](https://docs.polymarket.us/trader-guide/rate-limits).

### 3. What is allowed, and what remains unconfirmed

The public documentation expressly invites market-display applications. However,
the linked US app terms include APIs and grant personal, noncommercial data use
connected with trading (§5); automation through authorized APIs is allowed (§7).
**Our reading: this does not establish a licence for company analytics.** A public
endpoint or SDK software licence does not settle that question.
[US terms, effective 25 September 2025](https://polymarket.us/tos).

The following is a scope checklist for our proposed use, not a claim that every
item requires a separate paid product:

| Proposed activity | Position for this project |
| --- | --- |
| Access documented public endpoints without a key | Officially supported technically; bounded reads worked |
| Recurring collection and employee dashboard display | Obtain confirmation that the public route covers our company, or agree another route |
| Store snapshots, raw responses, backups and charts | Specify retention, historical use and deletion obligations; no project entitlement established |
| Compute changes, sentiment or cross-source scores | Confirm derived-data and combination rights |
| Send data to Anthropic or another processor | Separate unresolved use; employee-only display does not establish this permission |
| Public pages, customer API, downloadable exports | Outside the current scope; require separate rights assessment |
| Scrape website pages | Unnecessary; scraping and bulk downloads are restricted by §5 |

Polymarket US has a documented **Market Data Agreement** route via
**data@polymarket.us**, followed by public-key submission, review and issued
credentials. Its actual agreement was not available in the public material
reviewed, so retention, permitted recipients, AI processing, price and termination
terms remain unknown. This is one route to resolve rights; **we have not established
that every public API request requires it, or that payment is always required**.
[Data onboarding](https://docs.polymarket.us/data-guide/onboarding).

The institutional guides recommend local history storage, reference-data caching
and custom candle aggregation. These are intended capabilities of that route,
not activities that are categorically unavailable. The agreement must still
define our retention and commercial use; no specific permission for LLM prompts,
embeddings or model training was found in the reviewed sources.
[Storage practices](https://docs.polymarket.us/data-guide/market-data),
[Custom aggregation](https://docs.polymarket.us/data-guide/candlestick-data).

A trading-platform/ISV partnership is a different route with its own agreement;
it should not be assumed to authorize our news-and-data analytics use. Likewise,
participant agreements concern exchange participation and should not be applied
automatically to an anonymous public-data reader.
[ISV route](https://docs.polymarket.us/partners/partner-types/isvs),
[participant agreement](https://www.polymarketexchange.com/files/legal/latest/participant-agreement-corporate).

### 4. Proposed integration with our existing platform

**Proposed flow:** Polymarket US API → one backend collector → dedicated
prediction tables in Postgres → authenticated internal API → employee panel
beside macro news. These components are not implemented yet.

Our standalone `news-service` already uses TypeScript, Fastify and Postgres, with
ingestion jobs and an optional scheduler disabled by default. Its provider
interface returns articles linked to company
listings; prediction contracts need a separate module rather than an entry in
`NEWS_PROVIDER_ORDER`. The Next.js application already consumes this service over
HTTP through `src/lib/newsService.ts`.

| Component | Proposed change |
| --- | --- |
| Collector | Add a dedicated job and lock; begin with 20 selected macro contracts, metadata every 15 minutes and BBO every 30–60 seconds |
| Storage | Add market definitions, outcome identities, snapshots and ingestion status; retain source product, upstream IDs, slugs, rules and both upstream/collection timestamps |
| Internal API | Add market-list/detail/history/status endpoints; serve stored state so each page view does not independently call Polymarket |
| Interface | Add an optional Event markets panel to `GlobalNewsPage`, with source link, exact question/outcome, quote basis, age, status and spread |
| Operations | Track errors, 429s, missing/stale quotes and last successful collection; a failed prediction panel must not break news |

Twenty contract requests every 30 seconds average **0.67 requests/second** before
metadata, history and book calls. This is a proposed capacity estimate, not a
licence or freshness promise. Stagger requests and share the budget across all
workers using the same public IP. Start with selected books on demand; streaming
is not needed simply to put market context next to news.

**Changes required by the current code:**

- **Enforce employee access.** The root app describes itself as single-user with
  no authentication. The backend token currently protects fetch operations, not
  data reads. Put both the panel and its API behind employee authentication and a
  restricted service boundary. CORS or hiding a page does not enforce this scope.
- **Use an actual per-second limiter.** The existing per-minute token bucket starts
  full; setting it to 1,200/minute would permit a burst incompatible with 20/second.
- **Preserve decimals.** The backend globally converts Postgres `NUMERIC` values to
  JavaScript numbers. Use validated decimal strings or integer ticks for prices;
  confirm quantity and notional units before calculation.
- **Keep signing keys on the server.** The existing browser-side live-stock-price
  pattern must not be copied for a Polymarket signing secret. Any stream collector
  belongs in a supervised backend process with reconnect and snapshot recovery.
- **Keep the initial feature out of AI prompts.** The existing research pipeline
  sends inputs to Anthropic. Enable this separately only after its data-processing
  and derived-output scope is confirmed.

Code inspected: backend `src/providers/types.ts`, `src/ingest/scheduler.ts`,
`src/util/rateLimiter.ts`, `src/db/pool.ts`, `src/api/server.ts` and
`src/api/routes/operations.ts`; frontend `README.md`, `src/lib/newsService.ts`,
`src/components/GlobalNewsPage.tsx`, `src/lib/useLiveQuote.ts`,
`src/lib/pipeline.ts` and `src/lib/claude.ts`.

### 5. Data interpretation and checks before rollout

**A contract price is a market-implied estimate, not a verified event probability.**
Keep bid, ask, last trade and display price separate. Show spread, missing sides,
last-trade age and contract status; do not silently substitute zero for missing
data. A Fed contract is macro context, not automatically company-specific news.
Only combine outcomes after checking that their resolution rules make them
mutually exclusive and exhaustive.

The price-history endpoint provides **book-derived YES/NO display prices**, not
executed-trade history. YES normally follows the best ask and NO the complement
of the best bid, so their sum can exceed one. Fixed windows use different sampling
intervals; cache identical history requests for at least 30 seconds. Label provider
history separately from snapshots collected by our own job. Our empty/sparse
history result means we cannot promise a complete backfill.
[History reference](https://docs.polymarket.us/api-reference/price-history/get-price-history).

One actual listing returned deprecated `outcomes`/`outcomePrices` arrays whose
apparent order disagreed with explicit `marketSides`. Use validated side IDs,
`long`, descriptions and quote fields; **do not blindly zip the legacy arrays**.
The official TypeScript SDK supports public reads, but the reviewed market types
omit `marketSides` and its market resource has no history helper. Prefer a small
validated REST adapter initially; if using the SDK, pin a version and validate
responses rather than relying on its types alone.
[Market schema](https://docs.polymarket.us/api-reference/markets/get-markets),
[SDK types](https://github.com/Polymarket/polymarket-us-typescript/blob/main/src/types/markets.ts),
[SDK market resource](https://github.com/Polymarket/polymarket-us-typescript/blob/main/src/resources/markets.ts).

Keep market closure and final settlement separate. A missing settlement response
can mean the market is not settled; some contracts permit alternative settlement
values. Preserve the exact rules and state instead of assuming every closed
market has resolved to zero or one.
[Settlement endpoint](https://docs.polymarket.us/api-reference/markets/get-market-settlement),
[Settlement rules](https://docs.polymarket.us/learn/markets/contract-settlement).

A sampled Mexican rate-decision contract had a bid of 0.98 and ask of 0.99, with
only 19.17 units displayed at the best bid; its last trade was from the previous
day. This is one observation, not an overall liquidity finding. An approved pilot
should measure spread, depth, trade age, missing observations and history coverage
for each selected contract before treating the feed as a useful signal.

Verification should cover outcome mapping, decimal units, sparse history,
closed/resolved markets, retries and 429s, duplicate collection, stale labels,
unauthenticated access rejection and keeping data out of AI/export paths. If
streaming is introduced, validate actual message shapes and recovery after a gap;
overview and detailed examples currently differ. Do not promise lossless replay
without testing the protocol.
[WebSocket overview](https://docs.polymarket.us/api-reference/websocket/overview),
[detailed market stream](https://docs.polymarket.us/api-reference/websocket/markets).

### 6. What we can do now and what needs a decision

1. **Prepare now:** design the adapter, schema, internal API and panel with
   synthetic fixtures; define watchlist and quality criteria. Our limited public
   checks are already complete. Keep recurring production ingestion disabled.
2. **Resolve the exact use:** ask whether our company may use the public gateway
   for recurring internal analytics, or needs a Market Data Agreement. Specify
   legal entity and country, employee/hosting locations, audience, fields,
   retention, backups, derived metrics and any external processors. Request
   permitted route, fees/trial terms and deletion obligations. No request has
   been sent and no agreement or paid access has been accepted.
3. **Run an approved REST pilot:** proposed duration one week, 20 relevant
   contracts, private employee view and measured quality. Test connectivity from
   the intended deployment environment. The period and watchlist are design
   choices, not provider entitlements.
4. **Decide on production:** proceed only with documented usage scope and useful
   coverage/freshness. Add streaming if measurements justify it; consider AI
   use as a separate scope extension. Licence price is unknown, and public access
   alone is not evidence of a zero-cost commercial entitlement.

### 7. International Polymarket remains a separate option

For `polymarket.com`, the checked direct connections reset; a remote reader
returned a Gamma market and CLOB clock. This establishes limited retrieval,
not a dependable deployment path. Its Gamma, CLOB and WebSocket interfaces must
not be mixed with the US APIs or account credentials.
[International data APIs](https://docs.polymarket.com/market-data/discover-markets).

We retrieved the actual embedded terms automatically. The 11 August 2026 version,
§4.2, restricts access/use by covered capital-markets entities, including specified
fintech businesses and data distributors, and separately restricts redistribution.
It covers derived/aggregated data and contains no explicit internal-pilot
exception. Our legal entity's activities determine applicability. §4.1 restricts
VPN circumvention; changing network routes does not resolve rights.
[International terms](https://docs.google.com/document/d/1N4aYlRcqaWCeKMID7vUSWJ1UPMvw_v6SP4cOFN8ZxR4/preview).

ICE announced exclusive distribution for institutional capital markets, and
international Polymarket directs relevant firms to its licensing team and ICE.
Contact: **data-licensing@polymarket.com**. Confirm usage scope, delivery and pricing;
this is not necessarily buying an API key. **Do not transfer the ICE conclusion
to Polymarket US:** the US documentation provides its own direct data-onboarding
route. Neither route's price has been established for our project.
[ICE announcement](https://ir.theice.com/press/news-details/2026/ICE-Launches-Polymarket-Signals-and-Sentiment-Tool-Turning-Crowd-Sourced-Dynamic-Views-into-Market-Opportunities/default.aspx),
[international licensing](https://institutional.polymarket.com/).

## Kalshi — no

A properly regulated US exchange, so it looked promising. But its developer
agreement, which we read directly, limits the API to *"facilitating a member's own
trading"* and forbids *"collecting, caching, aggregating, or storing data."*

Plainly: **their API is for you to trade with, not to build a product on.**
Showing their prices to users is exactly what it prohibits. Also network-blocked.

## ForecastEx — worth trying

**This one works.** ForecastEx is a US exchange regulated by the CFTC, and that
regulation **requires it to publish its daily prices.** It does, as plain CSV
files on its website.

We downloaded them: no key, no account, current data. Each file gives, per market
per day, open, high, low, close, settlement price and open interest — a full
history of how the odds moved. It covers inflation (CPI), Fed rate decisions,
payroll employment, jobless claims, GDP, retail sales, housing starts and
elections.

**Rights still need checking:** the earlier review identified these files as
regulatory disclosures and did not locate applicable reuse terms. Required
publication does not itself establish permission for our integration.

**Check first:** most actual trading there is in *weather* markets. The economic
markets are real, but we haven't measured whether enough money trades in them for
the numbers to mean much.

## Suggestion

Evaluate **Polymarket US alongside ForecastEx** for an employee market-context
panel. The verified US API and live macro catalogue change the earlier basis for
prioritizing ForecastEx alone. Keep the news pipeline intact and use a separate
prediction-data module.

Prepare the US implementation on synthetic fixtures while confirming its exact
corporate usage scope. Then run a small approved REST pilot and measure data
quality. ForecastEx still needs usage-rights and liquidity checks; publication
of data alone is not a blanket reuse licence. International Polymarket requires
its own access/licensing assessment. No live integration or licensing outreach
was performed as part of this report update.
