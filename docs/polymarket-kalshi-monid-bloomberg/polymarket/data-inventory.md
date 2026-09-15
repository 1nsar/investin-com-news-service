# Polymarket US — data inventory and actual examples

**Updated 9 September 2026; saved API observations are from 8 September.**
API and capture timestamps are UTC. Website
screenshots preserve the site's displayed labels. We retrieved structured
public data directly from Polymarket US without a login, cookies, API key or VPN.
The examples establish that an internal market-context panel is technically
possible. They do not establish company usage rights, complete market coverage
or production reliability. This report and its evidence remain local; they have
not been published to GitHub. A local interactive MVP is implemented and tested;
its 9 September browser captures and validation are recorded separately below.

The companion **`Polymarket-Data-Inventory.xlsx`** contains the detailed inventory
and example values. Original responses and the request manifest are in
`evidence/2026-09-08/`. Each manifest entry records its URL, HTTP status,
request/receipt times and SHA-256 hash. Main API samples were received at
19:02:54–19:02:56; the resolved-market settlement sample at 19:03:47. These are
observations at those times, not current trading recommendations.[^1]

Workbook `AllObservedFields` catalogues every terminal field observed in all
13 saved responses, with array positions grouped as `[]`, observed types,
occurrence counts and up to three actual example values. `FieldExamples`
adds explanations for selected fields. This is a complete catalogue of those
observed responses; documented optional fields and the wider exchange catalogue
can exceed the sample. The newer chart has separate `MVPHistory` provenance.

## 1. What is available without an account

The public base is **`https://gateway.polymarket.us`**. We checked 13 requests:
12 returned HTTP 200; the open market's settlement request returned HTTP 404.
The official documentation describes this API as sufficient for applications
displaying market information. [^2].

| Data | Actual response inspected | Application use |
| --- | --- | --- |
| Search and event | One Fed event, containing five contracts | Find relevant topics and group related outcomes |
| Market definition | IDs, question, rules, dates, status, side identities and quotes | Explain exactly what a displayed number refers to |
| Event and market images | Image URLs, including a Fed-event portrait and a sports-team logo | Event artwork; separate from article images or an image-reuse licence |
| Best bid/offer (BBO) | Bid, ask, last price, depth counts and statistics | Compact quote card and spread |
| Order book | 13 bid levels and six offer levels | Depth and liquidity context |
| Price history | 249 daily-window and 57 weekly-window samples | Historical display-price charts |
| Settlement | Open-market 404; resolved-market value 1 | Distinguish unresolved contracts from final results |
| Reference data | Two series, two leagues and five tags | Navigation and classification |

The reference counts are the requested sample sizes, not catalogue totals.
No ongoing collector was started for that evidence capture. The local MVP's
interactive refresh behaviour is described in section 9.

![Official Polymarket US public API documentation in a browser](screenshots/polymarket-us-public-api-docs.png)

*Actual browser screenshot of the official documentation, captured at
2026-09-08 19:11:16.306 UTC. This is documentation evidence, not an API response.*

## 2. A real macro example: September Fed decision

Search `GET /v1/search?query=Fed&limit=1` returned event **65124**, slug
`usfed-fomc-2026-09-16`. The event-detail response contained five contracts, all
active and open. The event category was `macro`; its tags included `Econ`,
`macro` and `Fed`. The following quotes come from **one saved event response**,
received at 19:02:54.365 UTC.

| Contract title | Market ID | Best bid, USD | Best ask, USD |
| --- | --- | --- | --- |
| 50+ bps Increase | 313136 | 0.0100 | 0.0200 |
| 25 bps Increase | 313137 | 0.5100 | 0.5200 |
| No Change | 313138 | 0.4700 | 0.4800 |
| 25 bps Decrease | 313139 | Not supplied | 0.0100 |
| 50+ bps Decrease | 313140 | Not supplied | 0.0100 |

Values are at `event.markets[].bestBidQuote.value` and
`event.markets[].bestAskQuote.value`. A missing bid is not zero. These prices
must not be normalized into an invented probability distribution. Establish
outcome definitions and settlement rules before combining contracts.

![Public September Fed event page](screenshots/polymarket-us-fed-event.png)

*Actual Polymarket US website screenshot, captured at 2026-09-08 19:04:10.892 UTC.
It is a separate observation from the earlier API samples: website prices may
differ. Source: [^3].*

## 3. Market definitions and field mapping

We inspected `GET /v1/market/slug/rdc-usfed-fomc-2026-09-16-nochng`.
The singular `/market/slug/` path differs from the plural quote/book routes.
Its `market` object identified **No Change**, ID **313138**. The description
defines settlement using the upper bound of the federal funds target rate at
the September FOMC meeting and names the Federal Reserve as the source. Preserve
the complete rules in an approved implementation; this report paraphrases them.

| Field path | Observed value or meaning |
| --- | --- |
| `market.slug` | `rdc-usfed-fomc-2026-09-16-nochng` |
| `market.status` | `MARKET_STATUS_OPEN`; `closed` was false |
| `market.marketSides[].id` | Yes: 625838; No: 625839 |
| `market.marketSides[].long` | Yes: true; No: false |
| `market.marketSides[].quote.value` | Yes: 0.4800; No: 0.53 |
| `market.orderPriceMinTickSize` | 0.01 |
| `market.minimumTradeQty` | 0.01 |

Two actual inconsistencies matter. Event `endDate` was September 16 at 23:59,
whereas the contract's `endDate` was September 30 at 23:00. Store both, with
their field meaning; do not infer the meeting date from either alone. Also,
legacy `outcomes`/`outcomePrices` arrays were incomplete or misleading across
the five contracts. The 50+ bps decrease contract had two outcome labels but
only one price. Validate explicit side identities and quote fields rather than
zipping legacy arrays. [^4].

## 4. Quotes, depth and trading statistics

For the same No Change contract, the BBO response contained:

| JSON path under `marketData` | Value |
| --- | --- |
| `bestBid.value` / `bestAsk.value` | 0.4700 / 0.4800 USD |
| `lastTradePx.value` / `currentPx.value` | 0.4800 / 0.4700 USD |
| `longQuote.value` / `shortQuote.value` | 0.4800 / 0.53 USD |
| `bidDepth` / `askDepth` | 13 / 6 |
| `sharesTraded` / `openInterest` | 37233.5500 / 456927.4600 |

The book confirmed `marketData.bids[0]` at **0.4700**, quantity **566.1400**,
and `marketData.offers[0]` at **0.4800**, quantity **5129.0200**. The spread is
0.0100 USD. These are available quoted quantities at the sampled instant, not
guaranteed fills or proof of enduring liquidity.

Book `stats` also supplied open/high/low/close, last-trade quantity, notional and
individual update timestamps. For example, `lastTradeQty` was **0.3800** and
`lastTradeSetTime` was **19:00:56.848 UTC**, about two minutes before collection.
`notionalTraded.value` was **1828974.7500**, with currency `USD`; preserve the
reported field and verify its units and measurement period before calculating
turnover. Field availability alone does not validate our interpretation.

Do not collapse all price fields into “probability.” Current price, last trade,
executable quotes and sampled display prices differ even within these responses.
[^5],[^6]

## 5. History: useful data, with visible gaps

Both requests used `/v1/price-history`, with the contract slug as `symbol`.
Each `history[]` item contains Unix-seconds `timestamp`, `longPrice` and
`shortPrice`. These are book-derived display prices, not executed trades.

| Requested parameters | Actual returned coverage |
| --- | --- |
| `fixedInterval=INTERVAL_1D&fidelity=5` | 249 points; September 7 19:00 to September 8 19:00 |
| `fixedInterval=INTERVAL_1W&fidelity=180` | 57 points; September 1 18:00 to September 8 18:00 |

The weekly samples were three hours apart. Daily samples were usually five
minutes apart, with gaps from September 8 **06:25–06:50** and **06:50–09:55**.
The response does not establish why points were absent. Do not invent data
between observations or promise a complete historical archive.

The latest daily point was **0.48 long / 0.53 short**. Their sum exceeds one:
these display prices reflect the two sides and spread, rather than a pair of
complementary verified probabilities. The live `lastPriceSample.shortPx` field
was 0.52 instead; retain field identity and timestamp when comparing sources.[^7]

![Chart of observed Fed No Change history samples](screenshots/polymarket-us-fed-history.png)

*Chart generated from the actual saved history samples. It is our visualization,
not a screenshot of Polymarket's interface; missing samples remain missing.*

## 6. Settlement and reference data

The open Fed contract's dedicated settlement endpoint returned **404**, with
“Settlement not found.” Nevertheless, its BBO/book contained
`settlementPx.value=0.5000`. That field is therefore not proof of final event
resolution. A separate resolved sports contract,
`aec-nfl-lac-ten-2025-11-02`, returned **200** and `settlement: 1`; its market
status was `MARKET_STATUS_RESOLVED`. Resolve state and side identity together.[^8]

Reference calls returned series **NFL** and **NFL 2025**, leagues **UEFA** and
**MLB**, and five tags including **Supreme Court**. They expose IDs, labels,
slugs and sometimes parent/league relationships. A tag's existence does not
prove an active market or usable liquidity. Teams and schedules are documented
capabilities but were not separately requested in this inventory.

## 7. Images and news: different content sources

The public market schema includes `image`, subject images and team logos/icons.
Actual responses contained event artwork: the Fed event's `image` was a portrait
URL, while the sports-market sample referenced a team logo. Contract
`description` fields explain the question and settlement rules; they are not
article bodies. Image URLs establish technical availability, not unrestricted
rights to copy, redistribute or use third-party photographs and logos.
[Market reference](https://docs.polymarket.us/api-reference/markets/get-markets).

**Polymarket does publish journalism.** Its separate publication, **The Oracle**,
contains news analysis and interviews. The current US API documentation index
has no documented news/article endpoint. International Journalism Tools also
offer a market timeline with related stories, but that website feature does not
establish a supported news-ingestion API or a republication licence for us.
[^9],
[^10],[^11]

The MVP therefore uses **Polymarket US for market data and event artwork** and
our existing news sources for a separately labelled **Related news** section.
Keep the original publisher, date and article link. A topic match is contextual;
it does not establish that the article caused a price change. A link to The
Oracle is distinct from importing or reproducing its articles. News-provider
content and image rights remain governed by their own terms.

## 8. Connection options beyond the saved samples

| Route | Documented capability | Verification status |
| --- | --- | --- |
| Retail market WebSocket | Real-time books, price updates and trades; API key required | Optional credentialed connection implemented for the MVP; upstream authentication and delivery not tested |
| Direct Exchange data API | Read-only reference data, BBO, depth and statistics through REST/gRPC | Documentation reviewed; no credentials obtained |
| Private/account API | Own balances, positions, orders and private updates | Not accessed; unnecessary for the proposed panel |

Public REST is documented at **20 requests/second/IP**. It requires polling and
does not capture every intervening change. Retail keys require account and
identity verification; institutional data access has separate onboarding.
No measured streaming latency or service guarantee follows from these tests.
The local preview refreshes selected market data through REST every **10 seconds**;
this is polling, not an authenticated WebSocket session or a lossless trade feed.
[^12],
[^13],[^14]

## 9. Local MVP implementation and capture record

The local preview at **`/polymarket`** combines search and topic selection, event
graphics, YES/NO price tabs, a time-based history chart with shaded gaps,
order-book context, statistics, contract rules and related article cards. Its
path is **Next.js page → server-side adapter → public Polymarket US REST**.
It is separate from the
future persistent Postgres collector and employee production deployment.
Optional WebSocket support uses a server-side connection and forwards status,
quote and book updates to the page through SSE. It requires server-side
credentials; none are configured locally and no authenticated upstream stream
has been verified.

The preview deliberately limits scope: search returns up to **eight events**,
with up to **40 contracts per event**; the page shows the top **five bid and ask
levels** from an adapter capped at 50 per side. It displays **six news cards**
from at most 12 results and offers **one-day and one-week** history views.
These bounds describe the local interface, not an exhaustive exchange archive.

| Preview refresh | Implemented behaviour |
| --- | --- |
| Selected quotes and book | REST refresh every 10 seconds; pause control and hidden-tab pause |
| History | Reuse identical requests for 30 seconds; retain time spacing and gaps |
| Event detail | Refresh every 60 seconds |
| Related news | Refresh every five minutes through the separate news endpoint |

The product AI panel is hidden on this page and Polymarket prices are not sent
to its AI pipeline. Related news comes through the existing provider path.

Charts use returned historical display-price samples. They must retain gaps and
identify empty history rather than generate illustrative prices. Poll timestamps,
upstream price timestamps and last-trade timestamps describe different things.
Related news retains its own provider attribution; it is not presented as a
Polymarket news API response.

**Validation completed at 2026-09-09 02:27:04.221871 UTC.** Eleven recorded
browser checks covered public quotes/book/history, a loaded event image,
automatic refresh, pause/resume, day/week switching, keyboard chart inspection,
search and contract identity, simulated upstream failure with labelled old data,
390-pixel mobile layout, desktop/dark rendering and no browser runtime errors.
Ten real quote responses had receipt times from **02:26:20.925 to 02:27:00.930 UTC**.
The code also passed **19 unit tests, targeted ESLint, TypeScript checking and a
production build**. Authenticated upstream WebSocket remains untested.[^15]

The separately saved local response for **Fed No Change** recorded bid **0.47**,
ask **0.48**, YES **0.48**, NO **0.53**, and last trade **0.48**; the quote receipt
was **02:26:45.750 UTC**. Its chart data contained **243 points and four gaps**,
received at **02:26:21.673 UTC**. Workbook `MVPHistory` records these normalized
points and their file hash. They are distinct from the older 249-point sample in
section 5; each screenshot has its own capture time.[^16]

The related-news request returned **nine results with eight image URLs**; the
page displayed **six cards**. The newest returned article was dated **30 August
2026**. A successful provider request therefore does not establish real-time news:
the UI preserves article dates and source attribution.
An additional browser check confirmed that selecting a Bitcoin event changes
related news to the Crypto category; the news request uses that category without
sending Polymarket contract text to the news provider.

![Actual local Polymarket MVP market view](screenshots/polymarket-mvp-desktop.png)

*Actual local MVP at `http://127.0.0.1:3000/polymarket`, captured on 9 September
2026 at **02:26:51.323448 UTC**, using public REST data and an actual event image.
This is our interface, not the Polymarket website; the chart uses the separately
recorded local-response history, not the older static report sample.*

![Actual local Polymarket MVP related-news view](screenshots/polymarket-mvp-news.png)

*Actual local MVP related-news section, captured on 9 September 2026 at
**02:26:51.853924 UTC**. Article cards are attributed to configured providers;
they were not obtained through a Polymarket article API. Capture hashes and
the mobile/dark screenshots are in the validation record.*[^17]

## 10. Permission, cost and the practical next step

**No key was needed for these public reads; company usage permission is still
unresolved.** We made the requests without contacting Polymarket or requesting
individual technical approval. US documentation welcomes data displays, while linked app terms
limit the standard data licence to personal, noncommercial trading-related use.
Our interpretation is that neither public accessibility nor a personal login
establishes rights for recurring corporate analytics. Confirm our specific use
in writing, or obtain the appropriate agreement, before production collection.[^18]

| Question | Conclusion for our project |
| --- | --- |
| Can it connect without contacting Polymarket? | Public REST can; no key or separate technical approval step is required |
| Must we pay? | Not established; no public price for our intended corporate use was found |
| Does a working local page establish permission? | No; it demonstrates technical behaviour, not a corporate data licence or a provider-approved trial |
| What is needed before recurring production use? | Written confirmation of our public-API usage scope or an applicable agreement |

Calling a page local, internal or a pilot does not create a licensing exemption.
The saved samples and interactive development checks should be described by
their actual scope, not as an approved free commercial dataset.

The documented Market Data Agreement route is **data@polymarket.us**.
We have not established its price, that payment is inevitable, or that every
public API request requires institutional onboarding. The market response's
`feeCoefficient` is not a data-licence quote. Confirm employee display, storage,
retention, backups, event images, derived metrics and external AI processing explicitly.
No licensing request, purchase or trading action was made.[^19]

Polymarket's July 2026 Institutional Research announcement separately offers
commercial data sales for both its US and international exchanges through
`institutional@polymarket.com`. It does not publish our price or say that every
public read requires payment. The US fee schedule describes trading charges;
those charges are not a quote for a read-only data licence.
[^20],[^21]

**This inventory concerns Polymarket US.** International `polymarket.com` uses
separate APIs and licensing; ICE's international role does not establish a US
requirement.

## Sources

Official sources were reviewed on 8–9 September 2026. Local evidence retains its exact request or capture time; the terms cited are effective 25 September 2025.

1. Local validation evidence. [Original request manifest](evidence/2026-09-08/manifest.json).
2. Polymarket US. [Public API introduction](https://docs.polymarket.us/api-reference/introduction).
3. Polymarket US. [public event page](https://polymarket.us/event/usfed-fomc-2026-09-16).
4. Polymarket US. [Market reference](https://docs.polymarket.us/api-reference/markets/get-markets).
5. Polymarket US. [BBO](https://docs.polymarket.us/api-reference/markets/get-market-bbo).
6. Polymarket US. [order book](https://docs.polymarket.us/api-reference/markets/get-market-book).
7. Polymarket US. [History reference](https://docs.polymarket.us/api-reference/price-history/get-price-history).
8. Polymarket US. [Settlement API](https://docs.polymarket.us/api-reference/markets/get-market-settlement).
9. Polymarket / The Oracle. [The Oracle](https://news.polymarket.com/about).
10. Polymarket US. [US API index](https://docs.polymarket.us/llms.txt).
11. Polymarket / The Oracle. [Journalism Tools announcement](https://news.polymarket.com/p/new-polymarket-tools-for-journalists). 2 April 2026.
12. Polymarket US. [Limits](https://docs.polymarket.us/api-reference/rate-limits).
13. Polymarket US. [WebSocket](https://docs.polymarket.us/api-reference/websocket/markets).
14. Polymarket US. [institutional guide](https://docs.polymarket.us/data-guide/overview).
15. Local validation evidence. [Recorded browser checks](evidence/2026-09-09/mvp-validation.json).
16. Local validation evidence. [Local normalized response](evidence/2026-09-09/mvp-market.json).
17. Local validation evidence. [Screenshot metadata and hashes](evidence/2026-09-08/screenshots.json).
18. Polymarket US. [US terms, effective 25 September 2025, §§5, 7 and 19](https://polymarket.us/tos). 25 September 2025.
19. Polymarket US. [Data onboarding](https://docs.polymarket.us/data-guide/onboarding).
20. Polymarket / The Oracle. [Institutional Research announcement](https://news.polymarket.com/p/introducing-polymarket-institutional). 8 July 2026.
21. Polymarket US. [Trading fees](https://docs.polymarket.us/fees).

[^1]: [Original request manifest](evidence/2026-09-08/manifest.json).
[^2]: [Public API introduction](https://docs.polymarket.us/api-reference/introduction).
[^3]: [public event page](https://polymarket.us/event/usfed-fomc-2026-09-16).
[^4]: [Market reference](https://docs.polymarket.us/api-reference/markets/get-markets).
[^5]: [BBO](https://docs.polymarket.us/api-reference/markets/get-market-bbo).
[^6]: [order book](https://docs.polymarket.us/api-reference/markets/get-market-book).
[^7]: [History reference](https://docs.polymarket.us/api-reference/price-history/get-price-history).
[^8]: [Settlement API](https://docs.polymarket.us/api-reference/markets/get-market-settlement).
[^9]: [The Oracle](https://news.polymarket.com/about).
[^10]: [US API index](https://docs.polymarket.us/llms.txt).
[^11]: [Journalism Tools announcement](https://news.polymarket.com/p/new-polymarket-tools-for-journalists).
[^12]: [Limits](https://docs.polymarket.us/api-reference/rate-limits).
[^13]: [WebSocket](https://docs.polymarket.us/api-reference/websocket/markets).
[^14]: [institutional guide](https://docs.polymarket.us/data-guide/overview).
[^15]: [Recorded browser checks](evidence/2026-09-09/mvp-validation.json).
[^16]: [Local normalized response](evidence/2026-09-09/mvp-market.json).
[^17]: [Screenshot metadata and hashes](evidence/2026-09-08/screenshots.json).
[^18]: [US terms, effective 25 September 2025, §§5, 7 and 19](https://polymarket.us/tos).
[^19]: [Data onboarding](https://docs.polymarket.us/data-guide/onboarding).
[^20]: [Institutional Research announcement](https://news.polymarket.com/p/introducing-polymarket-institutional).
[^21]: [Trading fees](https://docs.polymarket.us/fees).
